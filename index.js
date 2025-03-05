const core = require('@actions/core');
const github = require('@actions/github');
const fsObj = require('node:fs');
var DOMParser = require('xmldom').DOMParser;

const { WebClient } = require('@slack/web-api');

const post_msg = async () => {
  const reportFilePath = core.getInput('testOutputPath');
  const testRunName = core.getInput('testRunName');
  const slackChannelId = core.getInput('slackChannelId');
  const token = core.getInput('slackToken');
  const web = new WebClient(
    token
  );
  const msgData = await messageBuilder(reportFilePath, testRunName);
  const mainMessage = await web.chat.postMessage({
    channel: slackChannelId,
    attachments: [{
      fallback: resultMessage(msgData),
      color: msgData.failed > 0 ? '#E01E5A' : '#2EB67D', // red if failed, green if passed
      text: resultMessage(msgData)
    }]
  });

  // Post failed test details in thread if there are failures
  if (msgData.failed > 0 && msgData.failedTests.length > 0) {
    const failureDetails = msgData.failedTests
      .map(test => `*${test.name}*\n${test.message}`)
      .join('\n\n');

    await web.chat.postMessage({
      channel: slackChannelId,
      thread_ts: mainMessage.ts,
      attachments: [{
        fallback: `Failed Tests Details:\n\n${failureDetails}`,
        color: '#E01E5A',
        text: `Failed Tests Details:\n\n${failureDetails}`,
      }]
    });
  }

  console.log(mainMessage);
};

async function readReportFile(reportFilePath) {
  const result = await fsObj.readFileSync(reportFilePath);
  return result;
}

async function messageBuilder(reportFilePath, testRunName) {
  //read report file and return object
  const fileContents = await readReportFile(reportFilePath);
  const xmlDoc = new DOMParser().parseFromString(
    fileContents.toString(),
    'text/xml'
  );
  const testSuiteNodes = xmlDoc.getElementsByTagName('testsuite')[0];
  const testCases = xmlDoc.getElementsByTagName('testcase');
  
  const failedTests = [];
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const errorNode = testCase.getElementsByTagName('error')[0] || testCase.getElementsByTagName('failure')[0];
    if (errorNode) {
      failedTests.push({
        name: testCase.getAttribute('name'),
        message: errorNode.getAttribute('message')
      });
    }
  }

  const testResult = {
    title: `*${testRunName}*`,
    total: Number(testSuiteNodes.getAttribute('tests')),
    failed: Number(testSuiteNodes.getAttribute('failures')),
    skipped: Number(testSuiteNodes.getAttribute('skipped')),
    time: testSuiteNodes.getAttribute('time'),
    failedTests
  };
  testResult.passed = testResult.total - (testResult.failed + testResult.skipped);
  return testResult;
}

function resultMessage(msgData) {
  return `${msgData.title} \n Total: \`${msgData.total}\` | Passed: \`${msgData.passed}\` | Failed: \`${msgData.failed}\` | Skipped: \`${msgData.skipped}\` \n Execution Time: \`${msgData.time}\``;
}

post_msg().catch(console.log);
