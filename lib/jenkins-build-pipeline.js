#!/usr/bin/env node

var DEBUG = require('debug');
var NESTOR = require('nestor');
var clc = require('cli-color');
var denodeify = require('denodeify');

var DEBUG_PREFIX = 'jenkins-build-pipeline:';

var JENKINS_USER = process.env.JENKINS_USER;
var JENKINS_PASSWORD = process.env.JENKINS_PASSWORD;
var JENKINS_HOST = process.env.JENKINS_HOST;

if (!JENKINS_USER || !JENKINS_PASSWORD || !JENKINS_HOST) {
  console.log('You need to pass JENKINS_USER, JENKINS_PASSWORD, JENKINS_HOST env variables');
  process.exit(1);
}

var nestor = new NESTOR('http://' + JENKINS_USER + ':' + JENKINS_PASSWORD + '@' + JENKINS_HOST + '/');
var buildJob = denodeify(nestor.buildJob.bind(nestor));
var readLatestJob = denodeify(nestor.readLatestJob.bind(nestor));

var JenkinsBuildPipeline = function() {};
// how often to poll JCP Jenkins for build progress info
JenkinsBuildPipeline.POLLING_INTERVAL_SECONDS = 5;
// detecting when the build is not yet queued, this must be at least 3x polling interval
JenkinsBuildPipeline.BUILD_NOT_YET_STARTED_DIFF_SECONDS = JenkinsBuildPipeline.POLLING_INTERVAL_SECONDS * 4;

/*
 * @param {String} jobName
 * @param {Boolean} isOngoing If we know that the build is already ongoing, this must be `true`
 * Otherwise, when we just scheduled a job and want to learn when it becomes ongoing, this must be `false`
 * @return {Promise<Object>}
 */
function readRecentlyScheduledJob(jobName, isOngoing) {
  isOngoing = isOngoing || false;

  var debug = DEBUG(DEBUG_PREFIX + 'readRecentlyScheduledJob');
  return readLatestJob(jobName).then(function(response) {
    //debug(JSON.stringify(response, "  "));

    debug('response.result: ', response.result);
    debug('response.timestamp: ', response.timestamp);
    debug('response.url: ', response.url);
    debug('response.number: ', response.number);

    //debug('response.duration: ', response.duration); //0
    //debug('response.estimatedDuration: ', response.estimatedDuration);

    var currentTs = +new Date();
    var diffSeconds = (currentTs - response.timestamp) / 1000;
    debug('Diff between current time and response.timestamp: ' + diffSeconds);

    var infoIsAboutPreviouslyFinishedBuild;
    if (isOngoing) {
      infoIsAboutPreviouslyFinishedBuild = false;
    } else {
      infoIsAboutPreviouslyFinishedBuild = diffSeconds > JenkinsBuildPipeline.BUILD_NOT_YET_STARTED_DIFF_SECONDS;
    }

    var buildInfo;
    if (infoIsAboutPreviouslyFinishedBuild) {
      debug('Diff too big, assuming the info is about previous build...');
      buildInfo = {
        isOngoing: false,
        isFinished: false
      }
    } else {
      buildInfo = {
        result: response.result,
        isOngoing: response.result === null,
        isFinished: response.result !== null,
        isSuccess: response.result === 'SUCCESS',
        buildNumber: response.number
      };
    }

    return buildInfo;
  });
}

/*
 * @return {Promise}
 * @return {Promise[resolved]} when build finished successfully
 * @return {Promise[rejected]} when build failed or something went wrong
 */
JenkinsBuildPipeline.startJob = function(jobName, artifactPrefix) {
  var debug = DEBUG(DEBUG_PREFIX + 'startJob');

  console.log('Starting job: ' + jobName);
  return buildJob(jobName, '')
    .then(function buildQueued(response) {
      var buildQueueUrl = response.headers.location;
      debug('Queued: ' + buildQueueUrl);
      return buildQueueUrl;
    })
    .then(function buildQueuedOrOngoing(buildQueueUrl) {
      return new Promise(function(resolve, reject) {
        var readRecentlyScheduledJobAndMaybeLoop = function(__isOngoing) {
          debug('method: readRecentlyScheduledJobAndMaybeLoop', __isOngoing);

          readRecentlyScheduledJob(jobName, __isOngoing).then(function(buildInfo) {
            if (buildInfo.isFinished) {
              resolve(buildInfo);
              debug('buildQueued: finished!');
            } else if (buildInfo.isOngoing) {
              debug('buildQueued: still ongoing...');
              setTimeout(function() {
                readRecentlyScheduledJobAndMaybeLoop(true);
              }, JenkinsBuildPipeline.POLLING_INTERVAL_SECONDS * 1000);
            } else {
              debug('buildQueued: not started yet...');
              setTimeout(function() {
                readRecentlyScheduledJobAndMaybeLoop(false);
              }, JenkinsBuildPipeline.POLLING_INTERVAL_SECONDS * 1000);
            }
          });
        };

        setTimeout(function() {
          readRecentlyScheduledJobAndMaybeLoop(false);
        }, JenkinsBuildPipeline.POLLING_INTERVAL_SECONDS * 1000);
        // TODO reject promise if didn't finish after N minutes of polling
        // reject({
        // isOngoing: false
        // isFinished: false
        // isSuccess: false,
        // isTimeout: true
        // })
      });
    })
    .then(function buildFinished(buildInfo) {
      return new Promise(function(resolve, reject) {
        if (buildInfo.result === 'SUCCESS') {
          console.log(clc.bold.yellow('BUILD RESULT OK'));
          console.dir(buildInfo);
          resolve(buildInfo);
        } else {
          console.log(clc.bold.red('BUILD RESULT KO'));
          console.dir(buildInfo);
          reject(buildInfo);
        }
      });
    });
};

/*
 * @return {Promise}
 * @return {Promise[resolved]} when all builds finished successfully
 * @return {Promise[rejected]} when some build failed or something went wrong
 */
JenkinsBuildPipeline.startBuildPipeline = function(jobNames) {
  var debug = DEBUG(DEBUG_PREFIX + 'startBuildPipeline');
  console.log('Build pipeline: ' + jobNames.join('; '));

  var promise = Promise.resolve();
  jobNames.forEach(function(jobName) {
    promise = promise.then(function() {
      debug('starting ' + jobName);
      return JenkinsBuildPipeline.startJob(jobName);
    })
  });
  return promise;
};

JenkinsBuildPipeline.readRecentlyScheduledJob = readRecentlyScheduledJob;
module.exports = JenkinsBuildPipeline;