const originalFetch = globalThis.fetch;

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

globalThis.fetch = async function mockedFetch(url, init) {
  const target = typeof url === 'string' ? url : url.toString();

  if (target.startsWith('https://api.duckduckgo.com/')) {
    const results = [];
    for (let i = 0; i < 3; i++) {
      results.push({
        Text: `Mock result ${i + 1}`,
        FirstURL: `https://example.com/mock-${i + 1}`,
      });
    }
    return jsonResponse({
      Heading: 'Mock Search',
      Abstract: 'Mock abstract',
      AbstractURL: 'https://example.com/mock',
      RelatedTopics: results,
    });
  }

  if (target.includes('/chat/completions')) {
    return jsonResponse({
      model: 'mock-model',
      choices: [
        { message: { content: '### Mock Report\n\nThis is a mocked synthesis response.' } },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
  }

  return originalFetch(url, init);
};
