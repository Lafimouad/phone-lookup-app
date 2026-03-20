import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { LambdaIntegration } from "aws-cdk-lib/aws-apigateway";

export interface PhoneLookupStackProps extends cdk.StackProps {}

export class PhoneLookupStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: PhoneLookupStackProps) {
    super(scope, id, props);

    const twilioEnv = {
      TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || "",
      TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || "",
      TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER || "",
    };

    // Handler file is located at project_root/serverless/handler.js
    const handlerEntry = path.join(__dirname, "..", "..", "handler.js");

    // Prefer importing the existing secret by name to avoid create conflicts.
    // You can override the secret name or provide an ARN via env vars if needed.
    const secretName =
      process.env.VERIFY_SECRET_NAME || "/phone-lookup/VERIFY_SECRET";
    const secretArnFromEnv = process.env.VERIFY_SECRET_ARN;

    let verifySecret: secretsmanager.ISecret;
    if (secretArnFromEnv) {
      verifySecret = secretsmanager.Secret.fromSecretCompleteArn(
        this,
        "VerifySecretImported",
        secretArnFromEnv,
      );
    } else {
      // Import by name (uses existing secret). This avoids CloudFormation create errors
      // when the secret already exists in the account. If you prefer CDK-managed secret,
      // set VERIFY_SECRET_ARN to the ARN of a new secret or modify this logic.
      verifySecret = secretsmanager.Secret.fromSecretNameV2(
        this,
        "VerifySecret",
        secretName,
      );
    }

    const lambdaEnv = {
      // Provide the secret ARN to the runtime; Lambdas will fetch the secret at runtime.
      VERIFY_SECRET_ARN: verifySecret.secretArn,
      ...twilioEnv,
    };

    const sendVerifyFn = new NodejsFunction(this, "SendVerifyFn", {
      entry: handlerEntry,
      handler: "sendVerify",
      runtime: lambda.Runtime.NODEJS_18_X,
      environment: lambdaEnv,
      bundling: {
        externalModules: ["aws-sdk"],
      },
    });

    const checkVerifyFn = new NodejsFunction(this, "CheckVerifyFn", {
      entry: handlerEntry,
      handler: "checkVerify",
      runtime: lambda.Runtime.NODEJS_18_X,
      environment: lambdaEnv,
      bundling: {
        externalModules: ["aws-sdk"],
      },
    });

    const lookupFn = new NodejsFunction(this, "LookupFn", {
      entry: handlerEntry,
      handler: "lookup",
      runtime: lambda.Runtime.NODEJS_18_X,
      environment: lambdaEnv,
      bundling: {
        externalModules: ["aws-sdk"],
      },
    });

    // Grant the functions permission to read the secret
    verifySecret.grantRead(sendVerifyFn);
    verifySecret.grantRead(checkVerifyFn);
    verifySecret.grantRead(lookupFn);

    // Twilio credentials secret (import by ARN or name). Use TWILIO_SECRET_ARN or default name.
    const twilioSecretArnFromEnv = process.env.TWILIO_SECRET_ARN;
    const twilioSecretName =
      process.env.TWILIO_SECRET_NAME || "/phone-lookup/TWILIO";
    let twilioSecret: secretsmanager.ISecret;
    if (twilioSecretArnFromEnv) {
      twilioSecret = secretsmanager.Secret.fromSecretCompleteArn(
        this,
        "TwilioSecretImported",
        twilioSecretArnFromEnv,
      );
    } else {
      // Import by name: references an existing secret by name. If you need CDK to create it,
      // change this to `new secretsmanager.Secret(...)` instead.
      twilioSecret = secretsmanager.Secret.fromSecretNameV2(
        this,
        "TwilioSecret",
        twilioSecretName,
      );
    }

    // Expose TWILIO_SECRET_ARN to Lambdas so handler can fetch credentials at runtime
    sendVerifyFn.addEnvironment("TWILIO_SECRET_ARN", twilioSecret.secretArn);
    checkVerifyFn.addEnvironment("TWILIO_SECRET_ARN", twilioSecret.secretArn);
    lookupFn.addEnvironment("TWILIO_SECRET_ARN", twilioSecret.secretArn);

    // Grant Lambdas permission to read Twilio secret
    twilioSecret.grantRead(sendVerifyFn);
    twilioSecret.grantRead(checkVerifyFn);
    twilioSecret.grantRead(lookupFn);

    // REST API (stable) using API Gateway
    const api = new apigw.RestApi(this, "PhoneLookupApi", {
      restApiName: "phone-lookup-api",
      deployOptions: { stageName: "prod" },
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS, // OPTIONS, GET, POST, etc.
      },
    });

    const sendIntegration = new LambdaIntegration(sendVerifyFn);
    const checkIntegration = new LambdaIntegration(checkVerifyFn);
    const lookupIntegration = new LambdaIntegration(lookupFn);

    const send = api.root.addResource("send-verify");
    send.addMethod("POST", sendIntegration);

    const check = api.root.addResource("check-verify");
    check.addMethod("POST", checkIntegration);

    const lookup = api.root.addResource("lookup");
    lookup.addMethod("GET", lookupIntegration);

    new cdk.CfnOutput(this, "RestApiUrl", { value: api.url });
  }
}
