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
wget https://github.com/InfuseAI/primehub-aws-cdk/archive/refs/heads/feature/primehub-starter.zip
unzip primehub-starter.zip
cd primehub-aws-cdk-feature-primehub-starter/

# set cdk never asking for approval
cp extras/cdk.json .

yarn install
./deploy
cat cdk.json
cdk deploy
exit 0
