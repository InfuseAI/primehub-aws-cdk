#!/bin/bash

export HOME=/root
whoami
pwd
yum update -y
yum install -y jq

EMAIL_NOTIFICATION_API="https://ykek6s29ol.execute-api.us-east-1.amazonaws.com/dev/one-click"

function notification::register() {
  local name=$1
  local email=$2
  local subscribe=${3:-no}
  if [[ "${email}" != "" ]]; then
    curl -s --location --request POST "${EMAIL_NOTIFICATION_API}" \
      --header 'Content-Type: application/json' \
      --data-raw "{
          \"email\": \"${email}\",
          \"name\": \"${name}\",
          \"subscribe\": \"${subscribe}\"
        }" | jq .id -r
  fi
}

function notification::completed() {
  local name=$1
  local id=$2
  local region=$3
  local password=$4

  cf_output=$(aws cloudformation describe-stacks --stack-name eks-${name}-cdk-stack --region ${region} --query "Stacks[0].Outputs[*]" --output text)
  stackId=$(aws cloudformation describe-stacks --stack-name eks-${name}-cdk-stack --region ${region} --query Stacks[0].StackId | sed 's/"//g')
  PRIMEHUB_URL=$(echo "${cf_output}" | grep "^PrimeHubURL" | awk '{$1 = ""; print $0;}' | sed 's/ //g')
  if [[ "${id}" != "" ]]; then
    curl -s --location --request PATCH "${EMAIL_NOTIFICATION_API}/${id}" \
      --header 'Content-Type: application/json' \
      --data-raw "{
          \"endpoint\": \"${PRIMEHUB_URL}\",
          \"region\": \"${region}\",
          \"stackId\": \"${stackId}\",
          \"password\": \"${password}\"
        }"
  fi
}

echo "Install Node"
cd /root
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
. ~/.nvm/nvm.sh
nvm install v16
node -e "console.log('Running Node.js ' + process.version)"

echo "Install Yarn and CDK"
npm install -g yarn
npm install -g aws-cdk@v1.134

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
PASSWORD="${PRIMEHUB_PASSWORD:-$(openssl rand -hex 16)}"
PRIMEHUB_VERSION='3.12.1'
EMAIL_NOTIFICATION=${EMAIL_NOTIFICATION:-}
EMAIL_NOTIFICATION_ID=''
SCALE_DWON_DELAY=2880 # 48hr
echo "Name: ${AWS_STACK_NAME}"
echo "Mode: ${PRIMEHUB_MODE}"
echo "Region: ${AWS_REGION}"
echo "Zone: ${AWS_ZONE}"
echo "System Instance Type: ${SYS_INSTANCE_TYPE}"
echo "CPU Instance Type: ${CPU_INSTANCE}"
echo "GPU Instance Type: ${GPU_INSTANCE}"
echo "Scale Down Delay: ${SCALE_DWON_DELAY}"

EMAIL_NOTIFICATION_ID=$(notification::register ${AWS_STACK_NAME} ${EMAIL_NOTIFICATION} ${SUBSCRIBE_NEWSLETTER})
echo "Deploy CDK ${AWS_STACK_NAME}"
export AWS_REGION
./deploy ${AWS_STACK_NAME} \
  --region ${AWS_REGION} \
  --zone ${AWS_ZONE} \
  --email ${EMAIL_NOTIFICATION} \
  --enforce-update-password \
  --primehub-version ${PRIMEHUB_VERSION} \
  --system-instance-type ${SYS_INSTANCE} \
  --cpu-instance-type ${CPU_INSTANCE} \
  --gpu-instance-type ${GPU_INSTANCE} \
  --scale-down-delay ${SCALE_DWON_DELAY} \
  --cpu-desired-capacity 1 \
  --mode ${PRIMEHUB_MODE} \
  --keycloak-password ${PASSWORD} \
  --primehub-password ${PASSWORD} || exit 1

notification::completed ${AWS_STACK_NAME} ${EMAIL_NOTIFICATION_ID} ${AWS_REGION} ${PASSWORD}
echo "Completed"
exit 0

