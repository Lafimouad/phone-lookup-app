#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PhoneLookupStack } from '../lib/phone-lookup-stack';

const app = new cdk.App();
new PhoneLookupStack(app, 'PhoneLookupStack', {
  /* stack props if needed */
});
