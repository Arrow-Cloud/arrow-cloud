import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

/**
 * Home for this account's scoped, non-human IAM identities - service users with an access key,
 * each with permissions tightened to exactly what that identity needs, instead of sharing one
 * broad (or root) credential across every use case. Started with a read-only identity for Claude
 * Code's local AWS CLI/MCP use (see docs/aws-mcp-access.md), but the intent is to grow this with
 * further identities as they come up - e.g. a deploy-only user/role scoped to just what `cdk deploy`
 * needs, separate from anyone's broad personal access.
 *
 * Deployed like any other stack (a human runs `cdk deploy IamStack`) - Claude Code does not deploy
 * this, or any stack, itself, and per project convention does not run any AWS CLI/MCP call -
 * including read-only ones - without asking first in the session.
 */
export class IamStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // This policy is the source of truth for the identity's scope - see docs/aws-mcp-access.md's
    // scope table/rationale, but don't duplicate the actual statements there; link back here.
    this.createServiceUser('ClaudeCode', 'claude-code-mcp', [
      new iam.PolicyStatement({
        sid: 'LogsReadOnly',
        actions: ['logs:FilterLogEvents', 'logs:GetLogEvents', 'logs:GetLogRecord', 'logs:DescribeLogStreams', 'logs:StartQuery', 'logs:GetQueryResults'],
        resources: [`arn:aws:logs:*:${this.account}:log-group:/aws/lambda/*`],
      }),
      new iam.PolicyStatement({
        sid: 'LambdaReadOnly',
        actions: ['lambda:GetFunction', 'lambda:GetFunctionConfiguration', 'lambda:ListTags', 'lambda:GetPolicy'],
        resources: [`arn:aws:lambda:*:${this.account}:function:*`],
      }),
      // Scoped to the event state tables only (not a blanket dynamodb:* grant) - this is the one
      // service where a broader grant could plausibly reach real user/play data outside the event
      // backends.
      new iam.PolicyStatement({
        sid: 'DynamoDbEventStateReadOnly',
        actions: ['dynamodb:GetItem', 'dynamodb:BatchGetItem', 'dynamodb:Query', 'dynamodb:Scan', 'dynamodb:DescribeTable'],
        resources: [
          `arn:aws:dynamodb:*:${this.account}:table/event-golf-state`,
          `arn:aws:dynamodb:*:${this.account}:table/event-golf-state/index/*`,
          `arn:aws:dynamodb:*:${this.account}:table/event-testevent-state`,
          `arn:aws:dynamodb:*:${this.account}:table/event-testevent-state/index/*`,
        ],
      }),
      new iam.PolicyStatement({
        sid: 'CloudFormationReadOnly',
        actions: ['cloudformation:DescribeStacks', 'cloudformation:DescribeStackResources', 'cloudformation:GetTemplate'],
        resources: [`arn:aws:cloudformation:*:${this.account}:stack/*`],
      }),
      // lambda:ListFunctions, logs:DescribeLogGroups, logs:StopQuery, and cloudformation:ListStacks
      // all have NO resource type in AWS's own IAM reference (confirmed via the service
      // authorization docs, not guessed) - they're account/region-wide "list everything" actions
      // that can only ever be scoped with Resource: "*", never a resource ARN pattern. Deployed and
      // tested without this split first: ListFunctions came back "no identity-based policy allows"
      // even though it was listed under LambdaReadOnly's function:* resource, which is what exposed
      // this. Doesn't newly expose anything LambdaReadOnly doesn't already: ListFunctions' response
      // includes the same env vars GetFunctionConfiguration does, and that's already granted
      // account-wide above.
      new iam.PolicyStatement({
        sid: 'AccountWideListReadOnly',
        actions: ['lambda:ListFunctions', 'logs:DescribeLogGroups', 'logs:StopQuery', 'cloudformation:ListStacks'],
        resources: ['*'],
      }),
      // For diagnosing latency in calls from a VPC-attached Lambda (ApiStack-ApiLambda) out to a
      // public endpoint (e.g. golf's read-api Function URL) - added specifically to trace an
      // unexplained ~1.5s delay that wasn't in the target Lambda's own execution time, so the
      // suspect is the network path (NAT/security group/routing) between them. Per AWS's own IAM
      // docs (troubleshoot_policies.html): "None of the ec2:Describe actions... support
      // resource-level permissions" - every one of these requires Resource: "*", there's no ARN to
      // scope them to.
      new iam.PolicyStatement({
        sid: 'Ec2NetworkDiagnosticsReadOnly',
        actions: [
          'ec2:DescribeSecurityGroups',
          'ec2:DescribeSecurityGroupRules',
          'ec2:DescribeNatGateways',
          'ec2:DescribeRouteTables',
          'ec2:DescribeVpcEndpoints',
          'ec2:DescribeSubnets',
          'ec2:DescribeVpcs',
          'ec2:DescribeNetworkAcls',
        ],
        resources: ['*'],
      }),
      // Belt-and-suspenders: wins over any of this identity's own Allow statements above, and over
      // a future accidental broadening of them, regardless of what else gets added to this policy.
      new iam.PolicyStatement({
        sid: 'ExplicitDenyHighRisk',
        effect: iam.Effect.DENY,
        actions: ['iam:*', 'secretsmanager:*', 'ssm:GetParameter', 'ssm:GetParameters', 'ssm:GetParametersByPath', 'sts:AssumeRole'],
        resources: ['*'],
      }),
    ]);

    // Add further identities here as they come up, e.g.:
    // this.createServiceUser('Deploy', 'deploy-only', [ ...cdk-deploy-scoped statements... ]);
  }

  /**
   * A service user with an access key stored in Secrets Manager - never in a CloudFormation output
   * or template - the shared shape for any of this account's scoped, non-human identities. Callers
   * own their own policy statements entirely (including any Deny they want), since what's
   * appropriate for one identity (e.g. read-only) may be actively wrong for another (e.g. a
   * deploy-only identity that legitimately needs iam:PassRole).
   */
  private createServiceUser(id: string, userName: string, statements: iam.PolicyStatement[]): void {
    const user = new iam.User(this, `${id}User`, { userName });
    user.attachInlinePolicy(new iam.Policy(this, `${id}Policy`, { policyName: `${userName}-policy`, statements }));

    const accessKey = new iam.AccessKey(this, `${id}AccessKey`, { user });

    // Combines the (non-secret) access key ID with the (secret) access key value into one JSON
    // secret - the standard CDK pattern for exactly this scenario. Neither value is ever written
    // into a CloudFormation output or template in plaintext.
    const credentials = new secretsmanager.Secret(this, `${id}Credentials`, {
      secretName: `${userName}-credentials`,
      description: `Access key for the ${userName} IAM user`,
      secretObjectValue: {
        AccessKeyId: cdk.SecretValue.unsafePlainText(accessKey.accessKeyId),
        SecretAccessKey: accessKey.secretAccessKey,
      },
    });

    new cdk.CfnOutput(this, `${id}CredentialsSecretArn`, {
      value: credentials.secretArn,
      description: `Retrieve with: aws secretsmanager get-secret-value --secret-id ${userName}-credentials --query SecretString --output text`,
    });
  }
}
