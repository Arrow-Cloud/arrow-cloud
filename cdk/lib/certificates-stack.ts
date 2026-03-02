import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';

export interface CertificatesStackProps extends cdk.StackProps {
  domainName: string; // e.g., arrowcloud.dance
  includeWww?: boolean; // optional SAN www
}

/**
 * Helper stack to request ACM certificates:
 * - In us-east-1: a cert for CloudFront with SANs for frontend and assets
 * - In us-east-2: a cert for API Gateway (api.<domain>)
 *
 * NOTE: DNS validation is set to DNS without Route53 zone integration.
 * You must add the DNS CNAMEs at Porkbun after deploy (check ACM console).
 */
export class CertificatesStackUsEast1 extends cdk.Stack {
  public readonly cloudFrontCertArn: string;

  constructor(scope: Construct, id: string, props: CertificatesStackProps) {
    super(scope, id, props);

    const { domainName, includeWww } = props;
    const sanNames: string[] = [`assets.${domainName}`, `share.${domainName}`];
    if (includeWww) sanNames.push(`www.${domainName}`);

    const cloudFrontCert = new acm.Certificate(this, 'CloudFrontWildcardCert', {
      domainName,
      subjectAlternativeNames: sanNames,
      validation: acm.CertificateValidation.fromDns(), // manual DNS validation at Porkbun
    });

    this.cloudFrontCertArn = cloudFrontCert.certificateArn;

    new cdk.CfnOutput(this, 'CloudFrontCertificateArn', {
      value: cloudFrontCert.certificateArn,
      description: 'ACM certificate ARN (us-east-1) for CloudFront: use for arrowcloud.dance, assets, and share subdomains',
    });
  }
}

export class CertificatesStackUsEast2 extends cdk.Stack {
  public readonly apiCertArn: string;

  constructor(scope: Construct, id: string, props: CertificatesStackProps) {
    super(scope, id, props);

    const { domainName } = props;
    const apiDomain = `api.${domainName}`;

    const apiCert = new acm.Certificate(this, 'ApiCustomDomainCert', {
      domainName: apiDomain,
      validation: acm.CertificateValidation.fromDns(), // manual DNS validation at Porkbun
    });

    this.apiCertArn = apiCert.certificateArn;

    new cdk.CfnOutput(this, 'ApiCertificateArn', {
      value: apiCert.certificateArn,
      description: 'ACM certificate ARN (us-east-2) for API Gateway: use for api.<domain>',
    });
  }
}
