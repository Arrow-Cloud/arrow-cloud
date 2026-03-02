# Arrow Cloud Frontend

## Localization

We use `react-intl` for localization and Crowdin as a TMS.

### Message Extraction

For now, strings are manually extracted with `npm run intl:extract` and the results should be committed back to the repo. Crowdin will see updates to the `src/intl/raw/en.json` file during its hourly sync jobs, and will have any new/changed strings show up in their interface for translation.

Translations added in Crowdin will automatically be pushed back to the repo via automatically created PRs that can be reviewed and merged as needed. Be sure to delete those branches after merging to help avoid conflicts appearing later on.

### Message Compilation

As an additional step, the extracted messages should be compiled to a more optimized format before delivery to prod. This is accomplished with a separate command `npm run intl:compile` which reads the existing extracted messages in `src/intl/raw/en.json` and outputs a `src/intl/compiled/en.json` file based on it.
