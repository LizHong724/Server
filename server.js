// server.js (MongoDB Atlas용 최종 수정 코드)

const express = require('express');
const { MongoClient } = require('mongodb'); // MongoDB 드라이버 사용
const cors = require('cors');
const path = require('path');

// 💡 환경 변수 설정
// Render에서 지정해 주는 PORT를 사용하거나, 로컬에서 테스트할 경우 3000을 사용합니다.
const PORT = process.env.PORT || 3000; 

// 🔑 MongoDB 설정: Render 환경 변수에서 URI를 가져옵니다.
const MONGODB_URI = process.env.MONGODB_URI; 
if (!MONGODB_URI) {
    console.error("🔴 MONGODB_URI 환경 변수가 설정되지 않았습니다. 서버를 종료합니다.");
    process.exit(1); // URI가 없으면 서버 시작 불가 (Status 1의 명확한 원인)
}

const client = new MongoClient(MONGODB_URI);
const DB_NAME = "surveyDB"; 
const COLLECTION_NAME = "responses"; // MongoDB의 컬렉션(테이블) 이름

const app = express();

// --- 미들웨어 설정 ---
app.use(cors()); // CORS 허용 (GitHub Pages와 통신 가능하게 함)
app.use(express.json()); // JSON 요청 본문 파싱

// --- 정적 파일 제공은 제거했습니다. (GitHub Pages에서 담당) ---
// 정적 파일 라우팅은 GitHub Pages에서 담당하므로, 이 서버는 API 역할만 수행합니다.

// 헬스 체크용 루트 경로
app.get('/', (req, res) => {
    res.status(200).send("Survey Backend API is running. Use /api/submit or /api/results.");
});

// --- API 엔드포인트 ---

// 1. 설문조사 응답 제출 API
app.post('/api/submit', async (req, res) => {
    const data = req.body;
    let mongoClient; // 연결 객체를 함수 스코프 내에서 선언

    try {
        mongoClient = await client.connect(); // 🚀 DB 연결 시도
        const database = mongoClient.db(DB_NAME);
        const responses = database.collection(COLLECTION_NAME);

        // MongoDB에 저장할 객체 준비
        const docToInsert = {
            ...data,
            // SQLite처럼 q1_c를 JSON 문자열로 변환할 필요 없이 배열로 저장 가능
            q1_c: Array.isArray(data.q1_c) ? data.q1_c : (data.q1_c ? [data.q1_c] : []),
            // finalReadingDuration 키를 readingDuration으로 통일하여 저장
            readingDuration: data.finalReadingDuration, 
            timestamp: new Date(),
            // consentAgreed를 boolean으로 변환하여 저장 (권장)
            consentAgreed: String(data.consentAgreed).toLowerCase() === 'true'
        };
        
        // 불필요한 클라이언트 키 (finalReadingDuration) 삭제
        delete docToInsert.finalReadingDuration;

        const result = await responses.insertOne(docToInsert);

        res.status(201).json({ message: "Survey submitted successfully!", id: result.insertedId });
    } catch (err) {
        console.error('🔴 Error inserting data:', err.message);
        return res.status(500).json({ message: "Server error during submission: " + err.message });
    } finally {
        if (mongoClient) {
             await client.close(); // 요청이 끝난 후 연결 닫기
        }
    }
});

// 2. 결과 데이터 가져오기 API
app.get('/api/results', async (req, res) => {
    let mongoClient;
    
    try {
        mongoClient = await client.connect(); // 🚀 DB 연결 시도
        const database = mongoClient.db(DB_NAME);
        const responses = database.collection(COLLECTION_NAME);
        
        // 최신 응답부터 가져오기 (timestamp 내림차순)
        const results = await responses.find({})
                                        .sort({ timestamp: -1 })
                                        .toArray();
        
        // 클라이언트(results.html) 요구사항에 맞게 키 이름 조정
        const processedResults = results.map(row => {
            // MongoDB의 기본 ID인 _id를 SQLite와 유사한 id로 변환하고, 
            // 클라이언트에서 사용하는 finalReadingDuration 키를 추가합니다.
            const finalRow = { 
                ...row, 
                id: row._id,
                finalReadingDuration: row.readingDuration // 클라이언트용 키 추가
            };
            
            delete finalRow._id; // MongoDB의 내부 _id 필드 제거
            delete finalRow.readingDuration; // 서버 내부용 키 제거

            return finalRow;
        });
        
        res.json(processedResults);
    } catch (err) {
        console.error('🔴 Error fetching data:', err.message);
        return res.status(500).json({ message: "Server error fetching results: " + err.message });
    } finally {
        if (mongoClient) {
             await client.close(); // 요청이 끝난 후 연결 닫기
        }
    }
});

// --- 서버 시작 ---
app.listen(PORT, () => {
    console.log(`✅ Server running successfully on port ${PORT}`);
    console.log(`API URL Example: http://localhost:${PORT}/api/submit`);
});
