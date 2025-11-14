// server.js (수정된 코드)

const express = require('express');
const { MongoClient } = require('mongodb'); // MongoDB 드라이버 불러오기
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000; // Render는 PORT 환경 변수를 사용합니다.

// 환경 변수에서 MongoDB URI를 불러옵니다. (Render에서 설정할 값)
const MONGODB_URI = process.env.MONGODB_URI; 
const client = new MongoClient(MONGODB_URI);
const DB_NAME = "surveyDB"; // 데이터베이스 이름 지정

// (미들웨어 및 정적 파일 설정은 그대로 유지)
app.use(cors()); 
app.use(express.json());

// 헬스 체크용 루트 경로 (GitHub Pages 파일을 제공하지 않음)
app.get('/', (req, res) => {
    res.status(200).send("Survey Backend API is running.");
});

// --- API 엔드포인트 ---

// 1. 설문조사 응답 제출 API
app.post('/api/submit', async (req, res) => {
    const data = req.body;

    try {
        await client.connect();
        const database = client.db(DB_NAME);
        const responses = database.collection('responses'); // 컬렉션(테이블) 이름 지정

        // 데이터 삽입
        const result = await responses.insertOne({
            ...data,
            timestamp: new Date(),
            // q1_c는 MongoDB에서 배열 형태로 그대로 저장 가능
            // finalReadingDuration 키를 그대로 사용
        });

        res.status(201).json({ message: "Survey submitted successfully!", id: result.insertedId });
    } catch (err) {
        console.error('Error inserting data:', err.message);
        res.status(500).json({ message: "Server error during submission." });
    } finally {
        await client.close(); // 연결 닫기
    }
});

// 2. 결과 데이터 가져오기 API
app.get('/api/results', async (req, res) => {
    try {
        await client.connect();
        const database = client.db(DB_NAME);
        const responses = database.collection('responses');

        const results = await responses.find({}).sort({ timestamp: -1 }).toArray();

        // MongoDB에서 가져온 데이터를 클라이언트가 원하는 형태로 가공 (키 이름은 이미 통일됨)
        const processedResults = results.map(row => {
            // MongoDB의 _id 필드는 제외하고, finalReadingDuration을 포함하도록 반환
            const finalRow = { ...row, id: row._id };
            delete finalRow._id; 
            return finalRow;
        });

        res.json(processedResults);
    } catch (err) {
        console.error('Error fetching data:', err.message);
        res.status(500).json({ message: "Server error fetching results." });
    } finally {
         await client.close();
    }
});


// --- 서버 시작 ---
// Render의 환경 변수 PORT를 사용하거나, 없으면 3000 사용
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});