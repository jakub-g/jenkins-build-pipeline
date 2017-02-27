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
    ]).then(function onPipelineSuccess(buildInfo) {
      // buildInfo is info about the build number of the last build in the pipeline
      console.log(buildInfo.buildNumber) // String like '123'
    }).catch(function onPipelineFailure() {
      // oops someting went wrong somewhere!
      // error API under construction
    });


Then in the console

    JENKINS_USER=myjenkinsuser JENKINS_PASSWORD=myjenkinspassword node my-jenkins-pipeline.js

Note: job name in the examples is a part of your Jenkins job URL after the first `job/`

For example, if you use nested folders on Jenkins and your URL is `/job/myproject/job/releases/job/master`,
then you should pass `myproject/job/releases/job/master` as job name.

Config
------

    var JenkinsBuildPipeline = require('jenkins-build-pipeline');

    // how often to shoot Jenkins API
    JenkinsBuildPipeline.POLLING_INTERVAL_SECONDS = 5;

    // If we ask Jenkins for the first time about the status of the build, and Jenkins tells us that
    // the build we ask about has just finished 1 second ago, it means the build info we got was about a previous build
    // This entry allows to customize that logic.
    JenkinsBuildPipeline.BUILD_NOT_YET_STARTED_DIFF_SECONDS = JenkinsBuildPipeline.POLLING_INTERVAL_SECONDS * 4;

Debugging
---------

    DEBUG=jenkins-build-pipeline node my-jenkins-pipeline.js

    See more at https://github.com/visionmedia/debug

Node version compat
-------------------

Tested on nodejs 4.x.
