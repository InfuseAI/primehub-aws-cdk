Feature: Provison EKS from one.primehub.io
  As a potential customer, I want to provision PrimeHub from one.primehub.io

  Background:
    Given I have an AWS Account
    And I visit one.primehub.io

  Scenario: Start provision PrimeHub frome one.primehub.io
    Given I am in the one.primehub.io
    When I click 1-click url
    Then I am in AWS sign-in page

  Scenario: Login to the AWS
    Given I am in AWS sign-in page

    When I choose "IAM user"
    And I fill Account alias
    And I click "Next" button
    And I fill IAM user name
    And I fill password
    And I click "Sign in" Button

    Then I am in the CloudFormation

  Scenario: Provison PrimeHub from CloudFormation
    Given I am in the CloudFormation

    When I see stack name "primehub-starter"
    And I fill an email to EmailNotification
    And I check "I acknowledge that AWS CloudFormation might create IAM resources."
    And I click "Create stack" button

    Then I see "primehub-starter" stack

  Scenario: Verify PrimeHub
    Given I have a PrimeHub

    When I visit the PrimeHub
    And I login to the PrimeHub

    Then I see the User Portal

  Scenario: Destroy PrimeHub
    Given I have a stack with the name "primehub-starter"
    When I destory the stack "primehub-starter"
    Then I have no stack "primehub-starter"

