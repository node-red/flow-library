const fs = require('fs');
const path = require('path');
const settings = require("../config");

const AWS = require("aws-sdk");

AWS.config.update(settings.aws);

const s3 = new AWS.S3({apiVersion: '2006-03-01'});


async function upload(pathToFile, fileName) {
    return new Promise((resolve,reject) => {
        const uploadParams = {Bucket: settings.aws.iconBucket, Key: '', Body: ''};
        const fileStream = fs.createReadStream(pathToFile);
        fileStream.on('error', function(err) {
            reject(err);
        });
        uploadParams.Body = fileStream;
        uploadParams.Key = fileName;
        s3.upload(uploadParams, function (err, data) {
            if (err) {
                reject(err);
            } if (data) {
                resolve(data.Location);
            }
});
    });
}

module.exports = {
    upload: upload
}

