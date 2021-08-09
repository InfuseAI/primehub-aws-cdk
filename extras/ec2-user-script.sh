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
wget https://github.com/InfuseAI/primehub-aws-cdk/archive/refs/tags/cfTemplate.zip
unzip cfTemplate.zip
cd primehub-aws-cdk-cfTemplate/

# set cdk never asking for approval
cp extras/cdk.json .
yarn install

echo "Prepare CDK"
AWS_REGION='us-east-1'
AWS_ZONE='a'
CPU_INSTANCE_TYPE='t3'
GPU_INSTANCE_TYPE='g4dn'
echo "Name: ${AWS_STACK_NAME}"
echo "Mode: ${PRIMEHUB_MODE}"
echo "Region: ${AWS_REGION}"
echo "Zone: ${AWS_ZONE}"
echo "CPU Instance Type: ${CPU_INSTANCE_TYPE}"
echo "GPU Instance Type: ${GPU_INSTANCE_TYPE}"

echo "Deploy CDK ${AWS_STACK_NAME}"
export AWS_REGION
./deploy ${AWS_STACK_NAME} --region ${AWS_REGION} --zone ${AWS_ZONE} --cpuInstanceType ${CPU_INSTANCE_TYPE} --gpuInstanceType ${GPU_INSTANCE_TYPE} --mode ${PRIMEHUB_MODE}

echo "Completed"
exit 0
