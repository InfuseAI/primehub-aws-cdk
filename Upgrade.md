# Upgrade PrimeHub installed by primehub-aws-cdk

## How to upgrade existing EKS Cluster

Once you use 1-click or the cdk deploy script to deploy the PrimeHub EKS Cluster, you can use the following steps to upgrade your PrimeHub cluster with latest version.

### Steps

1. Prepare AWS credentials file

    ```bash
    mkdir -p ~/.aws
    touch ~/.aws/credentials
    ```

     Edit credentials and add the content with the generated access key.

    ```bash
    # credentials
    [default]
    aws_access_key_id = xxx
    aws_secret_access_key = xxx
    region = us-east-1
    ```

1. Install the required tools

    - `awscli` Universal Command Line Interface for Amazon Web Services
  
      Please reference the [AWS CLI Official Document](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html) to install `awscli`.

    - `kubectl` The command line tool lets you control Kubernetes clusters

      Please reference the [Kubernetes Official Document](https://kubernetes.io/docs/tasks/tools/) to install `kubectl`

    - `aws-cdk` [Optional] A framework for defining cloud infrastructure in code

      Please reference the [AWS CDK Developer Guide](https://docs.aws.amazon.com/cdk/latest/guide/getting_started.html#getting_started_install) to install `aws-cdk`

1. Clone the `primehub-aws-cdk` github repo

    ```bash
    git clone https://github.com/InfuseAI/primehub-aws-cdk.git
    ```

1. Run the `connect` script to fetch the kubeconfig and PrimeHub configuration files.

    ```bash
    # List all available cluster in your 
    ./primehub-aws-cdk/connect --region us-east-1 --list

    # Fetch the kubeconfig and PrimeHub configuration files
    ./primehub-aws-cdk/connect --regsion us-east-1 <your-cluster-name>

    # Example
    ./primehub-aws-cdk/connect --regsion us-east-1 primehub-starter
    ```

1. After running the `connect` script, you can use `kubectl` and `helm` to verify the EKS cluster and PrimeHub.

    ```bash
    # Clone PrimeHub Repository 
    $ git clone https://github.com/InfuseAI/primehub.git

    # Install required tools 
    $ ./primehub/install/primehub-install required-bin

    # Set PATH 
    $ export PATH=$PATH:$HOME/bin

    # Check k8s node 
    $ kubectl get node
    NAME                          STATUS   ROLES    AGE   VERSION
    ip-10-0-29-171.ec2.internal   Ready    <none>   7d    v1.20.7-eks-135321

    # Check helm 
    $ helm ls -A 
    NAME                    NAMESPACE       REVISION        UPDATED                                 STATUS          CHART                           APP VERSION
    aws-ecr-credential      hub             1               2021-09-28 09:54:56.481498312 +0000 UTC deployed        aws-ecr-credential-1.5.0        1.5.0
    aws-efs-csi-driver      kube-system     1               2021-09-28 09:54:54.991699651 +0000 UTC deployed        aws-efs-csi-driver-2.2.0        1.3.4
    cert-manager            kube-system     1               2021-09-28 09:54:55.372646325 +0000 UTC deployed        cert-manager-v0.15.0            v0.15.0
    nginx-ingress           ingress-nginx   1               2021-09-28 09:54:55.567719036 +0000 UTC deployed        ingress-nginx-4.0.3             1.0.2
    nvidia-device-plugin    kube-system     1               2021-09-28 09:54:55.883676584 +0000 UTC deployed        nvidia-device-plugin-0.9.0      0.9.0
    primehub                hub             1               2021-09-28 09:57:56.158153215 +0000 UTC deployed        primehub-3.8.0-aws.0            v3.8.0-aws.0
    ```

1. Upgrade PrimeHub to specific version

    ```bash
    # List all available 1-click AWS PrimeHub version
    ./primehub/install/primehub-install version --aws

    # Upgrade 1-click AWS PrimeHub to specific version
    ./primehub/install/primehub-install upgrade primehub --primehub-version v3.8.0-aws.1

    # Upgrade 1-click AWS PrimeHub to latest version
    ./primehub/install/primehub-install upgrade primehub --aws
    ```
