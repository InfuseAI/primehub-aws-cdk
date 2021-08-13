#!/bin/sh

export HOME=/root
whoami
pwd
yum update -y
yum install -y jq

echo "Install Node"
cd /root
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
. ~/.nvm/nvm.sh
nvm install node
node -e "console.log('Running Node.js ' + process.version)"

echo "Install Yarn and CDK"
npm install -g yarn
npm install -g aws-cdk

echo "Download PrimeHub Starter"
tag=${GIT_TAG:-cfTemplate}
wget https://github.com/InfuseAI/primehub-aws-cdk/archive/refs/tags/${tag}.zip
unzip ${tag}.zip
cd $(unzip -Z -1 ${tag}.zip| head -1)

# set cdk never asking for approval
cp extras/cdk.json .
yarn install

echo "Prepare CDK"
AWS_REGION='us-east-1'
AWS_ZONE='a'
SYS_INSTANCE='t3.xlarge'
CPU_INSTANCE="${CPU_INSTANCE:-'t3.xlage'}"
GPU_INSTANCE="${GPU_INSTANCE:-'g4dn.xlarge'}"
PASSWORD="$(openssl rand -hex 16)"
echo "Name: ${AWS_STACK_NAME}"
echo "Mode: ${PRIMEHUB_MODE}"
echo "Region: ${AWS_REGION}"
echo "Zone: ${AWS_ZONE}"
echo "System Instance Type: ${SYS_INSTANCE_TYPE}"
echo "CPU Instance Type: ${CPU_INSTANCE}"
echo "GPU Instance Type: ${GPU_INSTANCE}"

echo "Deploy CDK ${AWS_STACK_NAME}"
export AWS_REGION
./deploy ${AWS_STACK_NAME} --region ${AWS_REGION} --zone ${AWS_ZONE} --systemInstanceType ${SYS_INSTANCE} --cpuInstanceType ${CPU_INSTANCE} --gpuInstanceType ${GPU_INSTANCE} --mode ${PRIMEHUB_MODE} --keycloak-password ${PASSWORD} --primehub-password ${PASSWORD} || exit 1

echo "Completed"
exit 0
