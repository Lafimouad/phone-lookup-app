import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { LambdaProxyIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';

export interface PhoneLookupStackProps extends cdk.StackProps {}

export class PhoneLookupStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: PhoneLookupStackProps) {
    super(scope, id, props);

    const lambdaEnv = {
      VERIFY_SECRET: process.env.VERIFY_SECRET || '',
      TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || '',
      TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || '',
      TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER || ''
    };

    const handlerPath = path.join(__dirname, '../../handler.js');
    // Using the serverless folder as the function code root
    const baseDir = path.join(__dirname, '..', '..');

    const sendVerifyFn = new NodejsFunction(this, 'SendVerifyFn', {
      entry: path.join(baseDir, 'serverless', 'handler.js'),
      handler: 'sendVerify',
      runtime: lambda.Runtime.NODEJS_18_X,
      environment: lambdaEnv,
    });

    const checkVerifyFn = new NodejsFunction(this, 'CheckVerifyFn', {
      entry: path.join(baseDir, 'serverless', 'handler.js'),
      handler: 'checkVerify',
      runtime: lambda.Runtime.NODEJS_18_X,
      environment: lambdaEnv,
    });

    const lookupFn = new NodejsFunction(this, 'LookupFn', {
      entry: path.join(baseDir, 'serverless', 'handler.js'),
      handler: 'lookup',
      runtime: lambda.Runtime.NODEJS_18_X,
      environment: lambdaEnv,
    });

    // HTTP API
    const api = new HttpApi(this, 'PhoneLookupApi', {
      apiName: 'phone-lookup-api',
    });

    const sendIntegration = new LambdaProxyIntegration({ handler: sendVerifyFn });
    const checkIntegration = new LambdaProxyIntegration({ handler: checkVerifyFn });
    const lookupIntegration = new LambdaProxyIntegration({ handler: lookupFn });

    api.addRoutes({ path: '/send-verify', methods: [HttpMethod.POST], integration: sendIntegration });
    api.addRoutes({ path: '/check-verify', methods: [HttpMethod.POST], integration: checkIntegration });
    api.addRoutes({ path: '/lookup', methods: [HttpMethod.GET], integration: lookupIntegration });

    new cdk.CfnOutput(this, 'HttpApiUrl', { value: api.apiEndpoint });
  }
}
