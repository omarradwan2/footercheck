const { scan } = require('../../scanner');
exports.handler = async (event) => {
  const headers = { 'content-type': 'application/json', 'cache-control': 'public, max-age=600' };
  try {
    const result = await scan((event.queryStringParameters || {}).url);
    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: e.message || 'Scan failed' }) };
  }
};
