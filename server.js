const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');

// 💡 환경 변수 설정
// Render에서 지정해 주는 PORT를 사용합니다.
const PORT = process.env.PORT || 3000; 

// 🔑 MongoDB 설정: Render 환경 변수에서 URI를 가져옵니다.
const MONGODB_URI = process.env.MONGODB_URI; 
if (!MONGODB_URI) {
    console.error("🔴 MONGODB_URI 환경 변수가 설정되지 않았습니다. 서버를 종료합니다.");
    process.exit(1); 
}

// MongoClient 인스턴스는 한 번만 생성합니다.
const client = new MongoClient(MONGODB_URI);
const DB_NAME = "surveyDB"; 
const COLLECTION_NAME = "responses"; 

const app = express();

// --- 미들웨어 설정 ---
app.use(cors()); // CORS 허용
app.use(express.json()); // JSON 요청 본문 파싱

// 헬스 체크용 루트 경로
app.get('/', (req, res) => {
    res.status(200).send("Survey Backend API is running. Use /api/submit or /api/results.");
});

// --- API 엔드포인트 ---

/**
 * 1. 설문조사 응답 제출 API
 * * ⭐ 핵심 개선: try-catch-finally 블록을 사용하여 MongoDB 연결 관리를 강화합니다.
 * - 연결 실패, 데이터 삽입 실패 등 모든 오류 발생 시에도 연결을 안전하게 닫고 500 에러를 반환합니다.
 */
app.post('/api/submit', async (req, res) => {
    const data = req.body;
    let mongoClient = null; // 연결 객체를 null로 초기화

    try {
        // ⭐ 연결 시도 및 성공 시 mongoClient에 할당
        mongoClient = await client.connect(); 
        const database = mongoClient.db(DB_NAME);
        const responses = database.collection(COLLECTION_NAME);

        // 데이터 가공 (클라이언트에서 'finalReadingDuration'을 'readingDuration'으로 변환)
        const docToInsert = {
            ...data,
            // q1_c가 항상 배열이도록 보장
            q1_c: Array.isArray(data.q1_c) ? data.q1_c : (data.q1_c ? [data.q1_c] : []),
            // 서버에서 MongoDB 컬럼 이름은 'readingDuration'을 사용
            readingDuration: data.finalReadingDuration, 
            timestamp: new Date(),
            consentAgreed: String(data.consentAgreed).toLowerCase() === 'true'
        };
        
        // 최종 데이터 삽입 전에 임시 키(finalReadingDuration) 삭제
        delete docToInsert.finalReadingDuration;

        const result = await responses.insertOne(docToInsert);

        res.status(201).json({ message: "Survey submitted successfully!", id: result.insertedId });
    } catch (err) {
        console.error('🔴 Error inserting data:', err.message, err.stack);
        // 클라이언트에게 500 오류 응답 반환
        return res.status(500).json({ message: "Server error during submission: " + err.message });
    } finally {
        // ⭐ 연결 객체가 유효할 때만 닫기 (오류로 인해 연결에 실패했더라도 안전하게 처리)
        if (mongoClient) { 
            try {
                await mongoClient.close();
            } catch (closeErr) {
                console.error('🔴 Error closing MongoDB connection:', closeErr.message);
            }
        }
    }
});

/**
 * 2. 결과 데이터 가져오기 API (안정성 강화)
 */
app.get('/api/results', async (req, res) => {
    let mongoClient = null;
    
    try {
        // ⭐ 연결 시도 및 성공 시 mongoClient에 할당
        mongoClient = await client.connect(); 
        const database = mongoClient.db(DB_NAME);
        const responses = database.collection(COLLECTION_NAME);
        
        const results = await responses.find({})
                                        .sort({ timestamp: -1 })
                                        .toArray();
        
        // 클라이언트(surveyresults.html)가 사용하는 키 이름으로 변환하여 전송
        const processedResults = results.map(row => {
            const finalRow = { 
                ...row, 
                id: row._id,
                finalReadingDuration: row.readingDuration // 클라이언트용 키로 변환
            };
            
            delete finalRow._id;
            delete finalRow.readingDuration; // DB 키는 삭제

            return finalRow;
        });
        
        res.json(processedResults);
    } catch (err) {
        console.error('🔴 Error fetching data:', err.message, err.stack);
        return res.status(500).json({ message: "Server error fetching results: " + err.message });
    } finally {
        if (mongoClient) {
            try {
                await mongoClient.close();
            } catch (closeErr) {
                console.error('🔴 Error closing MongoDB connection after fetching:', closeErr.message);
            }
        }
    }
});

// --- 서버 시작 ---
app.listen(PORT, () => {
    console.log(`✅ Server running successfully on port ${PORT}`);
});
