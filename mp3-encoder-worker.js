// Web Worker for MP3 encoding - runs in background thread
// This allows conversion at full speed without blocking the UI

// Load lamejs library into worker context
importScripts('https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js');

self.onmessage = async (event) => {
  const { samples, sampleRate, channels, bitrate, messageId } = event.data;

  try {
    // Verify lamejs is available in worker context
    if (typeof lamejs === 'undefined') {
      throw new Error('lamejs library not available in worker');
    }

    const mp3Encoder = new lamejs.Mp3Encoder(channels, sampleRate, bitrate);
    const mp3Data = [];
    const sampleBlockSize = 1152;
    const totalChunks = Math.ceil(samples.length / sampleBlockSize);
    let lastProgressTime = 0;
    const progressThrottle = 100; // milliseconds

    // Process all chunks at full speed
    for (let i = 0; i < samples.length; i += sampleBlockSize) {
      const sampleChunk = samples.subarray(i, i + sampleBlockSize);
      const mp3buf = mp3Encoder.encodeBuffer(sampleChunk);

      if (mp3buf.length > 0) {
        mp3Data.push(new Int8Array(mp3buf));
      }

      // Send progress update only every 100ms to reduce message overhead
      const now = performance.now();
      const chunkIndex = Math.floor(i / sampleBlockSize) + 1;
      if (now - lastProgressTime >= progressThrottle) {
        self.postMessage({
          type: 'progress',
          progress: chunkIndex / totalChunks,
          messageId: messageId
        });
        lastProgressTime = now;
      }
    }

    // Flush remaining data
    const finalMp3 = mp3Encoder.flush();
    if (finalMp3.length > 0) {
      mp3Data.push(new Int8Array(finalMp3));
    }

    // Convert to Blob and send back
    const mp3Blob = new Blob(mp3Data, { type: 'audio/mp3' });

    // Convert Blob to ArrayBuffer for transfer
    const arrayBuffer = await mp3Blob.arrayBuffer();

    self.postMessage({
      type: 'complete',
      data: arrayBuffer,
      size: arrayBuffer.byteLength,
      messageId: messageId
    }, [arrayBuffer]); // Transfer ownership for zero-copy

  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error.message,
      messageId: messageId
    });
  }
};
