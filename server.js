// server.js
const express = require('express');
const multer = require('multer');
const AWS = require('aws-sdk');
const fs = require('fs');
require('dotenv').config();

const app = express();
const upload = multer({ dest: 'uploads/' });

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  region: process.env.AWS_REGION,
});

const s3 = new AWS.S3();
const rekognition = new AWS.Rekognition();

// Serve static files from the public folder
app.use(express.static('public'));

// API สำหรับอัปโหลดวิดีโอและประมวลผลด้วย AWS Rekognition
app.post('/api/upload', upload.single('video'), (req, res) => {
  const videoFile = req.file;
  const searchTerm = req.body.searchTerm;

  const uploadParams = {
    Bucket: 'rekognition-video-mis01',  // ใช้ bucket ที่กำหนด
    Key: `${Date.now()}_${videoFile.originalname}`,
    Body: fs.createReadStream(videoFile.path),
  };

  // อัปโหลดวิดีโอไปที่ S3
  s3.upload(uploadParams, (err, data) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Error uploading video to S3.');
    }

    const s3VideoUrl = data.Location;
    console.log(`Video uploaded to S3: ${s3VideoUrl}`);

    // เริ่มประมวลผลวิดีโอใน AWS Rekognition
    const rekognitionParams = {
      Video: {
        S3Object: {
          Bucket: uploadParams.Bucket,
          Name: uploadParams.Key,
        },
      },
      MinConfidence: 70 // กำหนดค่าความมั่นใจขั้นต่ำ
    };

    rekognition.startLabelDetection(rekognitionParams, (err, rekogData) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Error starting Rekognition.');
      }

      console.log(`Rekognition job started with JobId: ${rekogData.JobId}`);

      // ดึงผลลัพธ์การตรวจจับวัตถุจาก Rekognition
      setTimeout(() => {
        rekognition.getLabelDetection({ JobId: rekogData.JobId }, (err, resultData) => {
          if (err) {
            console.error(err);
            return res.status(500).send('Error fetching results from Rekognition.');
          }

          // จัดรูปแบบผลลัพธ์ให้แสดงเวลาเริ่มและเวลาสิ้นสุดของแต่ละวัตถุ
          const labels = resultData.Labels.map(item => ({
            Name: item.Label.Name,
            StartTime: (item.Timestamp / 1000).toFixed(2), // เปลี่ยนเวลาเป็นวินาที
            EndTime: ((item.Timestamp + 1000) / 1000).toFixed(2)
          }));

          res.json({ message: 'Rekognition processing complete', labels });
        });
      }, 15000); // รอประมาณ 15 วินาทีเพื่อให้ Rekognition ประมวลผลเสร็จ
    });
  });
});

// เริ่มเซิร์ฟเวอร์
app.listen(3000, () => {
  console.log('Server running on port 3000');
});
