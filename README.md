# CDK with PrimeHub on AWS EKS

This repo contains code demonstrating how to set up PrimeHub and PrimeHub ready EKS cluster by CDK.
The EKS cluster will include a Managed Node Group for PrimeHub system and 2 Auto Scaling Groups for computing tasks.

![image](Dev-EKS.png)
## Prerequisites

* [Optional] Setup a public domain served by route 53
* AWS CLI with correct credentials configuration
* Node.js version >= 10.13.0 (We recommend a version in active long-term support, which, at this writing, is the latest 14.x release.)
* CDK version >= 1.115
* yarn
* ts-node

## What is being deployed

* VPC without NAT gatway
* EKS cluster with Managed-nodegroup x1 and Self-managed nodes x 2
* EFS with dynamic provisioner configured on EKS
* S3 buckets, 1 for PrimeHub configuration, 1 for object store
* Cluster-autoscaler on EKS
* Ingress-nginx-controller on EKS
* Cert-manager on EKS
* PrimeHub on EKS

## Usage

### Deployment

Way to deploy the EKS stack with AWS CDK

```bash
git clone https://github.com/InfuseAI/primehub-aws-cdk.git
cd primehub-aws-cdk
./deploy <cluster-name>
```

### Login

The above deployment may take around 20 minutes, depending on your region, the data center workload, and networking status. Go and check your AWS CloudFormatioin console. By clicking `Stacks`, you should have the deployed stack named after `<your-stack-project-name>-cdk-stack` in the `Stack name` column. Click `<your-stack-project-name>-cdk-stack`. The console will show you the details of your stack a.k.a. `<your-stack-project-name>-cdk-stack`.

Select the `Outputs` tab of the stack details. Refer to `PrimeHubURL` to get the URL of PrimeHub, and get the account name and password according to `PrimeHubAccount` and `KeycloakPassword`.

### Destroy EKS Stack

Way to destroy the existing EKS stack

```bash
cdk destroy
```

Or please reference the following document to destroy the cluster.

* [How to destroy PrimeHub Cluster created by Launch Stack URL](docs/destroy-cluster.md)

### FAQ

Please see [FAQ.md](FAQ.md)
