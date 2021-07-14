# PrimeHub CDK Starter

Click it to create PrimeHub EKS by CloudFormation [![Launch Stack](https://s3.amazonaws.com/cloudformation-examples/cloudformation-launch-stack.png)](https://console.aws.amazon.com/cloudformation/home?region=ap-northeast-1#/stacks/new?stackName=primehub-eks-starter&templateURL=https://primehub.s3.amazonaws.com/cloudformation/primehub-starter-cloudformation.yaml)

## Customization

We use CloudFormation to provision an ec2 instance to run the primehub-aws-cdk.

### Parameters

We could define many parameters in the [primehub-starter-cloudformation.yaml](primehub-starter-cloudformation.yaml). 


For example, there is a parameter `PrimeHubInstallMode`:

```yaml
Parameters:
  PrimeHubInstallMode:
    Type: String
    Default: ce
    AllowedValues:
      - ce
      - ee
    Description: PrimeHub installion mode, Please enter ce or ee. Default is ce.
```

In our `user-data-script`, it could be evaluated with `Fn::Sub` function:

```bash
UserData:
  Fn::Base64: !Sub |
        #!/bin/sh
        export PRIMEHUB_MODE="${PrimeHubInstallMode}"
```

## Release Process

Any new CloudFormation template should upload to our S3 bucket and set it public to download.
