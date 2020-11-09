const fs = require('fs');
const path = require('path');
const settings = require("../config");

const AWS = require("aws-sdk");

AWS.config.update(settings.aws);

const s3 = new AWS.S3({apiVersion: '2006-03-01'});


async function upload(pathToFile, fileName) {
    return new Promise((resolve,reject) => {
        const uploadParams = {Bucket: settings.aws.iconBucket, Key: '', Body: ''};

        if (/\.svg$/i.test(pathToFile)) {
            uploadParams.ContentType = "image/svg+xml"
        } else if (/\.png$/i.test(pathToFile)) {
            uploadParams.ContentType = "image/png"
        } else if (/\.jpg/i.test(pathToFile)) {
            uploadParams.ContentType = "image/jpeg"
        } else if (/\.gif/i.test(pathToFile)) {
            uploadParams.ContentType = "image/gif"
        }

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

