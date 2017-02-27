jenkins-build-pipeline
======================

[![Get it on npm](https://nodei.co/npm/jenkins-build-pipeline.png?compact=true)](https://www.npmjs.org/package/jenkins-build-pipeline)

> Promise-based API for starting a pipeline of subsequent jobs

This implementation uses polling of `/job/<jobName>/lastBuild/api/json` Jenkins HTTP API,
without using queue API (for some reason, my company's Jenkins fork does not support queue API... don't ask).

Installation
-----------

    npm install --save jenkins-build-pipeline

Usage
-----

    var JenkinsBuildPipeline = require('jenkins-build-pipeline');

    JenkinsBuildPipeline.startBuildPipeline([
      'job1', 'job2'
    ])
    .then(function onPipelineSuccess(buildInfo) {
      // buildInfo is info about the build number of the last build in the pipeline
      console.log(buildInfo.buildNumber) // String like '123'
    })
    .catch(function onPipelineFailure(buildInfo) {
      if (buildInfo.isTimeoutWhileOngoing) {
        msg = 'Build taking too long, giving up on following it. Check status on ' + buildInfo.url;
      } else if (buildInfo.isTimeoutWhileQueued) {
        msg = 'Build queued for too long, giving up on following it. Check status on ' + buildInfo.url;
      } else if (buildInfo.isSuccess === false) {
        msg = 'Build failed! Check status on ' + buildInfo.url;
      } else {
        msg = 'Unexpected error during the pipeline execution or inside jenkins-build-pipeline code!';
      }
      console.error(msg);
    });


Then in the console

    JENKINS_USER=myjenkinsuser JENKINS_PASSWORD=myjenkinspassword node my-jenkins-pipeline.js

Note: job name in the examples is a part of your Jenkins job URL after the first `job/`

For example, if you use nested folders on Jenkins and your URL is `/job/myproject/job/releases/job/master`,
then you should pass `myproject/job/releases/job/master` as job name.

Config
------

You can configure polling interval, and when to report a timeout while build is still queued or ongoing.

You should set this value to an abnormally high time that should not happen in normal cases.
For example if your builds typically take 6-8 minutes, set it to e.g. 15 minutes.

Note that the build might be still queued or ongoing just fine, but maybe your build server is slow,
or there's a bug in pipeline code. Anyway, if build time significantly surpasses the timeout value,
some intervention is needed.

For now the build is stopped and a promise rejection happens when hitting the timeout.

This is how you override the defaults:

    var JenkinsBuildPipeline = require('jenkins-build-pipeline');

    JenkinsBuildPipeline.POLLING_INTERVAL_SECONDS = 15;
    JenkinsBuildPipeline.BUILD_NOT_YET_STARTED_DIFF_SECONDS = JenkinsBuildPipeline.POLLING_INTERVAL_SECONDS * 3;
    JenkinsBuildPipeline.QUEUED_TIMEOUT_SECONDS = 5 * 60;
    JenkinsBuildPipeline.ONGOING_TIMEOUT_SECONDS = 30 * 60;

    JenkinsBuildPipeline.startBuildPipeline(...)

Debugging
---------

    DEBUG=jenkins-build-pipeline node my-jenkins-pipeline.js

    See more at https://github.com/visionmedia/debug

Node version compat
-------------------

Tested on nodejs 4.x.
