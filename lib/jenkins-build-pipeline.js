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
JenkinsBuildPipeline.POLLING_INTERVAL_SECONDS = 15;

// detecting when the build is not yet queued, this must be bigger than polling interval
JenkinsBuildPipeline.BUILD_NOT_YET_STARTED_DIFF_SECONDS = JenkinsBuildPipeline.POLLING_INTERVAL_SECONDS * 3;

// If queued more than 5 minutes, stop the script and notify
JenkinsBuildPipeline.QUEUED_TIMEOUT_SECONDS = 5 * 60;

// If build takes more than 30 minutes, stop the script and notify
// If your build is expected to take perhaps longer than this, update this value
JenkinsBuildPipeline.ONGOING_TIMEOUT_SECONDS = 30 * 60;

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

    var buildInfo = {
      jobName: jobName,
      url: response.url,
      isTimeout: false
    };
    if (infoIsAboutPreviouslyFinishedBuild) {
      debug('Diff too big, assuming the info is about previous build...');
      buildInfo = Object.assign({}, buildInfo, {
        isOngoing: false,
        isFinished: false
      });
    } else {
      buildInfo = Object.assign({}, buildInfo, {
        result: response.result,
        isOngoing: response.result === null,
        isFinished: response.result !== null,
        isSuccess: response.result === 'SUCCESS',
        buildNumber: response.number
      });
    }

    return buildInfo;
  });
}

/*
 * @return {Promise}
 * @return {Promise[resolved]} with BuildInfo when build finished successfully
 * @return {Promise[rejected]} with BuildInfo when build failed or something went wrong
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
        var ticksElapsedWhileQueued = 0;
        var ticksElapsedWhileOngoing = 0;

        var MAX_TICKS_WHILE_ONGOING = JenkinsBuildPipeline.ONGOING_TIMEOUT_SECONDS /
          JenkinsBuildPipeline.POLLING_INTERVAL_SECONDS;
        var MAX_TICKS_WHILE_QUEUED = JenkinsBuildPipeline.QUEUED_TIMEOUT_SECONDS /
          JenkinsBuildPipeline.POLLING_INTERVAL_SECONDS;

        var readRecentlyScheduledJobAndMaybeLoop = function(__isOngoing) {
          debug('method: readRecentlyScheduledJobAndMaybeLoop', __isOngoing);

          readRecentlyScheduledJob(jobName, __isOngoing).then(function(buildInfo) {
            if (buildInfo.isFinished) {
              if (buildInfo.isSuccess) {
                debug('buildQueued: finished and success!');
                resolve(buildInfo);
              } else {
                debug('buildQueued: finished but failed!');
                reject(buildInfo);
              }
            } else if (buildInfo.isOngoing) {
              debug('buildQueued: still ongoing...');
              ++ticksElapsedWhileOngoing;

              if (ticksElapsedWhileOngoing >= MAX_TICKS_WHILE_ONGOING) {
                reject(Object.assign({}, buildInfo, {
                  isTimeout: true,
                  isTimeoutWhileOngoing: true
                }));
              } else {
                setTimeout(function() {
                  readRecentlyScheduledJobAndMaybeLoop(true);
                }, JenkinsBuildPipeline.POLLING_INTERVAL_SECONDS * 1000);
              }
            } else {
              debug('buildQueued: not started yet...');
              ++ticksElapsedWhileQueued;

              if (ticksElapsedWhileQueued >= MAX_TICKS_WHILE_QUEUED) {
                reject(Object.assign({}, buildInfo, {
                  isTimeout: true,
                  isTimeoutWhileQueued: true
                }));
              } else {
                setTimeout(function() {
                  readRecentlyScheduledJobAndMaybeLoop(false);
                }, JenkinsBuildPipeline.POLLING_INTERVAL_SECONDS * 1000);
              }
            }
          });
        };

        setTimeout(function() {
          readRecentlyScheduledJobAndMaybeLoop(false);
        }, JenkinsBuildPipeline.POLLING_INTERVAL_SECONDS * 1000);
      });
    })
    .then(function buildFinished(buildInfo) {
      return new Promise(function(resolve, reject) {
        if (buildInfo.result === 'SUCCESS') {
          console.log(clc.bold.yellow('Build result: OK'));
          console.log(buildInfo.url);
          resolve(buildInfo);
        } else {
          console.log(clc.bold.red('Build result: KO'));
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

  var pipelineLength = jobNames.length;
  var promise = Promise.resolve();
  jobNames.forEach(function(jobName, idx) {
    promise = promise.then(function() {
      console.log('Starting ' + jobName +
        ' (pipeline item #' + (idx + 1) + ' out of #' + pipelineLength + ')');
      return JenkinsBuildPipeline.startJob(jobName);
    })
  });
  return promise;
};

JenkinsBuildPipeline.readRecentlyScheduledJob = readRecentlyScheduledJob;
module.exports = JenkinsBuildPipeline;