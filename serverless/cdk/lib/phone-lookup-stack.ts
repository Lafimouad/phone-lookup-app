import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import { LambdaIntegration } from 'aws-cdk-lib/aws-apigateway';

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

    // Handler file is located at project_root/serverless/handler.js
    const handlerEntry = path.join(__dirname, '..', '..', 'handler.js');

    const sendVerifyFn = new NodejsFunction(this, 'SendVerifyFn', {
      entry: handlerEntry,
      handler: 'sendVerify',
      runtime: lambda.Runtime.NODEJS_18_X,
      environment: lambdaEnv,
      bundling: {
        externalModules: ['aws-sdk']
      }
    });

    const checkVerifyFn = new NodejsFunction(this, 'CheckVerifyFn', {
      entry: handlerEntry,
      handler: 'checkVerify',
      runtime: lambda.Runtime.NODEJS_18_X,
      environment: lambdaEnv,
      bundling: {
        externalModules: ['aws-sdk']
      }
    });

    const lookupFn = new NodejsFunction(this, 'LookupFn', {
      entry: handlerEntry,
      handler: 'lookup',
      runtime: lambda.Runtime.NODEJS_18_X,
      environment: lambdaEnv,
      bundling: {
        externalModules: ['aws-sdk']
      }
    });

    // REST API (stable) using API Gateway
    const api = new apigw.RestApi(this, 'PhoneLookupApi', {
      restApiName: 'phone-lookup-api',
      deployOptions: { stageName: 'prod' },
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS, // OPTIONS, GET, POST, etc.
      }
    });

    const sendIntegration = new LambdaIntegration(sendVerifyFn);
    const checkIntegration = new LambdaIntegration(checkVerifyFn);
    const lookupIntegration = new LambdaIntegration(lookupFn);

    const send = api.root.addResource('send-verify');
    send.addMethod('POST', sendIntegration);

    const check = api.root.addResource('check-verify');
    check.addMethod('POST', checkIntegration);

    const lookup = api.root.addResource('lookup');
    lookup.addMethod('GET', lookupIntegration);

    new cdk.CfnOutput(this, 'RestApiUrl', { value: api.url });
  }
}
