import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
console.log('API Key found:', apiKey ? 'YES' : 'NO');

const genAI = new GoogleGenerativeAI(apiKey);

async function test() {
  try {
    console.log('Testing text generation...');
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    const result = await model.generateContent('Hello, just testing!');
    console.log('Text generation works');

    console.log('\nTesting embedding generation...');
    const embedModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    const embedResult = await embedModel.embedContent('test content');
    console.log('Embedding works, dimensions:', embedResult.embedding.values.length);
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Full error:', JSON.stringify(error, null, 2));
  }
}

test();
