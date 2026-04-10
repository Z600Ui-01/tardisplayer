// ── 캡처 기능 ──
document.getElementById('screenshotBtn').addEventListener('click', () => {
    const target = document.querySelector('.window');
    const originalBorder = target.style.border;
    target.style.border = 'none';

    html2canvas(target, {
        backgroundColor: '#FAF4E8',
        scale: 2,
        useCORS: true,
        logging: false,
        allowTaint: true
    }).then(c => {
        target.style.border = originalBorder;
        const defaultName = 'capture_' + Date.now();
        const fileName = prompt('파일명을 입력하세요', defaultName);
        if (fileName === null) return;
        const link = document.createElement('a');
        link.download = (fileName || defaultName) + '.png';
        link.href = c.toDataURL('image/png');
        link.click();
    }).catch(() => {
        target.style.border = originalBorder;
        alert('캡처에 실패했습니다. 브라우저를 확인해주세요.');
    });
});

// ── 초기화 및 이벤트 리스너 ──
const audio = document.getElementById('audioPlayer');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const progressThumb = document.getElementById('progressThumb');
const timeCurrent = document.getElementById('timeCurrent');
const timeTotal = document.getElementById('timeTotal');
const btnPlay = document.getElementById('btnPlay');
const playIcon = document.getElementById('playIcon');
const btnBack = document.getElementById('btnBack');
const btnFwd = document.getElementById('btnFwd');
const titleText = document.getElementById('titleText');
const audioInput = document.getElementById('audioInput');
const audioIcon = document.getElementById('audioIcon');
const captureIcon = document.getElementById('captureIcon');

// ── 프롬프트 ──
// 항상 쓰이는 핵심 고유명사 (고정)
const coreVocab = `TARDIS, Time Lord, Gallifrey, Sonic Screwdriver, Jelly Baby, Dalek, Davros, Cyberman, Sontaran, Zygon, The Master, Rassilon,`;
// 에피소드마다 바꿔주는 전용 고유명사 (인물 이름, 행성 이름 등)
const episodeVocab = '';
// 컴패니언 이름
const campanionVocab = 'Sarah, Leela, Romana, K-9, K9, Adric, brigadier, Lethbridge-Stewart,';
// Whisper 프롬프트는 에피소드별 고유명사가 있으면 그것도 포함, 없으면 핵심 고유명사 + 컴패니언 이름만
const whisperPrompt = episodeVocab ? `${coreVocab}, ${episodeVocab}, ${campanionVocab}` : `${coreVocab}, ${campanionVocab}`;

// const claudeSystemPrompt = `너는 닥터후 오디오 드라마 자막 번역기야. 영어를 한국어로 번역해.
// - 캐릭터의 성격과 관계에 맞는 자연스러운 구어체 한국어
// - 주인공으로 나오는 닥터와 컴패니언의 성격을 반영한 번역
// - 닥터는 컴패니언에게 반말 사용, 그 외의 관계에서는 상황에 적절하게
// - 컴패니언은 특수한 상황이 아니면 닥터에게 존댓말을 사용
// - 감정이 실린 대사는 직역보다 감정 전달 우선
// - 조연끼리의 위계와 관계도 고려해서 반말과 존댓말을 적절하게 사용
// - 빌런 캐릭터는 빌런에게 어울리는 말투를 사용
// - 영국식 유머와 말장난은 한국어에서도 재치있게 살릴 것
// - 고유명사(타디스, 소닉 드라이버, 달렉, 마스터 등)는 그대로 유지
// - 한 번호에 여러 화자의 대사가 있으면 / 로 구분해서 번역
// - 입력된 번호 하나당 번역 결과도 정확히 하나. 여러 번호를 합치거나 하나를 쪼개지 말 것
// - 번호|번역 형식 외의 텍스트 출력 금지`;
const claudeSystemPrompt = `You are an expert subtitle translator for Doctor Who audio dramas. Translate English to Korean.
Follow these rules strictly:
- Tone & Relationship: Use natural, conversational Korean reflecting the characters' personalities.
- The Doctor -> Companion: Use informal language (반말/Banmal). For others, adjust appropriately by context.
- Companion -> The Doctor: Use polite/formal language (존댓말/Jondaetmal) unless in highly specific or emotional situations.
- Supporting Characters: Apply Banmal or Jondaetmal correctly based on their hierarchy and relationships.
- Villains: Use an appropriately sinister or arrogant tone fitting for villains.
- Emotion & Nuance: Prioritize emotional delivery and context over literal, word-for-word translation.
- British Humor: Adapt British humor, idioms, and puns wittily into natural Korean.
- Proper Nouns: Maintain terms like 타디스(TARDIS), 소닉 스크류드라이버(Sonic Screwdriver), 달렉(Dalek), 마스터(Master), 젤리베이비(Jelly Baby).
- Multiple Speakers: If multiple speakers share a single subtitle number, separate their lines using a slash (/).
- STRICT FORMATTING: Maintain a strict 1:1 mapping between input and output numbers. NEVER merge or split numbers.
- OUTPUT FORMAT: You must ONLY output in the "Number|Translated Text" format. No intro, no outro, no extra text.`;

// ── Whisper STT ──
async function transcribeTrack(file, offsetSec) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'segment');
    formData.append('timestamp_granularities[]', 'word');
    formData.append('language', 'en');
    if (whisperPrompt) formData.append('prompt', whisperPrompt);

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + openaiKey },
        body: formData
    });

    // 🚨 응답이 정상이 아니면 강제로 에러 터뜨리기!
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(`OpenAI STT 에러 (${res.status}): ${errData.error?.message || '키가 틀렸거나 요금이 부족합니다.'}`);
    }

    const data = await res.json();

    if (!data.segments) {
        console.error('STT 실패:', data);
        return [];
    }

    const raw = data.segments
        .filter(seg => {
            // no_speech 필터 (느슨하게 0.8)
            if ((seg.no_speech_prob || 0) >= 0.8) {
                console.log('no_speech 필터:', (seg.no_speech_prob || 0).toFixed(2), seg.text);
                return false;
            }
            // 30초 이상 segment 필터
            if (seg.end - seg.start > 30) {
                console.log('긴 segment 필터:', (seg.end - seg.start).toFixed(1) + '초', seg.text);
                return false;
            }
            return true;
        })
        .map(seg => {
            // word 타임스탬프로 싱크 보정
            let start = seg.start + offsetSec;
            let end = seg.end + offsetSec;
            if (seg.words && seg.words.length > 0) {
                start = seg.words[0].start + offsetSec;
                end = seg.words[seg.words.length - 1].end + offsetSec;
            }
            return { start, end, text: seg.text.trim() };
        });

    // 중복/밀림 필터
    const filtered = [];
    for (let i = 0; i < raw.length; i++) {
        const seg = raw[i];
        if (!seg.text) continue;
        if (seg.end <= seg.start) continue;
        if (filtered.length > 0) {
            const prev = filtered[filtered.length - 1];
            if (seg.text === prev.text && Math.abs(seg.start - prev.start) < 2) continue;
            if (seg.start < prev.end - 0.5) continue;
            if (seg.text === prev.text && seg.start < prev.end + 5) continue;
        }
        filtered.push(seg);
    }

    filtered.forEach(seg => {
        seg.text = seg.text
            .replace(/\bcanine\b/gi, 'K9')
            .replace(/\bK-9\b/g, 'K9');
    });

    return filtered;
}

// ── 여러 트랙 처리 ──
async function transcribeAll(files) {
    const MAX_SIZE = 25 * 1024 * 1024; // 25MB를 바이트로 계산
    let oversizedFiles = [];

    // 1. 보내기 전에 미리 전수조사!
    for (let i = 0; i < files.length; i++) {
        if (files[i].size > MAX_SIZE) {
            oversizedFiles.push(`${i + 1}번 파일 (${(files[i].size / 1024 / 1024).toFixed(1)}MB)`);
        }
    }

    // 2. 범인이 있다면 즉시 중단하고 안내
    if (oversizedFiles.length > 0) {
        alert(`🚨 타디스 과부하 발생!\n\n다음 파일이 OpenAI 제한(25MB)을 초과했습니다:\n- ${oversizedFiles.join('\n- ')}\n\n파일을 더 작게 쪼개서 다시 업로드해주세요!`);
        throw new Error("파일 용량 초과로 중단됨"); // 실행 멈춤
    }
    
    let allSubs = [];
    let offset = 0;

    for (let i = 0; i < files.length; i++) {
        setTitle('STT ' + (i + 1) + '/' + files.length + '...');
        const subs = await transcribeTrack(files[i], offset);
        allSubs = allSubs.concat(subs);

        // 이 트랙의 실제 길이를 구해서 다음 오프셋에 반영
        const duration = await getAudioDuration(files[i]);
        offset += duration;

        // // 🚨 OpenAI 서버가 과부하 걸리지 않게 2.5초 쉬어주기 (Rate Limit 방어)
        // if (i < files.length - 1) {
        //     await new Promise(resolve => setTimeout(resolve, 2500));
        // }
    }

    setTitle('STT COMPLETE');
    return allSubs;
}

// ── 오디오 길이 구하기 ──
function getAudioDuration(file) {
    return new Promise(resolve => {
        const tmpAudio = new Audio();
        tmpAudio.src = URL.createObjectURL(file);
        tmpAudio.addEventListener('loadedmetadata', () => {
            resolve(tmpAudio.duration);
            URL.revokeObjectURL(tmpAudio.src);
        });
    });
}

// ── Claude 번역 ──
async function translateSubtitles(subs) {
    const batchSize = 25;
    for (let i = 0; i < subs.length; i += batchSize) {
        const batch = subs.slice(i, i + batchSize);
        const numberedLines = batch.map((s, j) => (i + j + 1) + '|' + s.text).join('\n---\n');
        const expectedCount = batch.length;

        setTitle('번역 중 ' + (i + 1) + '-' + Math.min(i + batchSize, subs.length) + '/' + subs.length + '...');

        let attempts = 0;
        let success = false;

        while (attempts < 3 && !success) {
            attempts++;
            try {
                const userMsg = attempts === 1
                    ? '다음 자막을 한국어로 번역해.\n규칙: 각 번호는 ---로 구분된 독립된 대사임. 번호 하나당 번역 결과도 정확히 하나. 절대 합치지 말 것. 번호|번역 형식으로만 응답.\n총 ' + expectedCount + '개 번호를 빠짐없이 출력할 것.\n\n' + numberedLines
                    : '다음 자막을 한국어로 번역해.\n\n⚠️ 중요: 이전 시도에서 번호가 밀리는 오류가 발생함.\n- 입력 번호와 출력 번호가 반드시 1:1 대응해야 함\n- 예시: 입력이 5|Hello 이면 출력도 반드시 5|안녕\n- 두 줄을 합쳐서 번역하지 말 것\n- 총 ' + expectedCount + '개 전부 출력할 것\n- 번호|번역 형식으로만 응답\n\n' + numberedLines;

                const res = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': anthropicKey,
                        'anthropic-version': '2023-06-01',
                        'anthropic-dangerous-direct-browser-access': 'true'
                    },
                    body: JSON.stringify({
                        model: 'claude-sonnet-4-20250514',
                        //model: 'claude-3-5-haiku-latest', 
                        max_tokens: 4096,
                        
                        // 프롬프트 캐싱 적용 (배열 형태로 변경 후 cache_control 추가)
                        system: [
                            {
                                type: "text",
                                text: claudeSystemPrompt,
                                cache_control: { type: "ephemeral" }
                            }
                        ],
                        messages: [{ role: 'user', content: userMsg }]
                    })
                });

                // 🚨 API 에러 감지!
                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(`Anthropic 에러 (${res.status}): ${errData.error?.message || '키 오류 또는 문제 발생'}`);
                }

                const data = await res.json();
                const text = data.content[0].text;
                const parsed = [];
                text.split('\n').filter(l => l.match(/^\d+\|/)).forEach(line => {
                    const match = line.match(/^(\d+)\|(.+)/);
                    if (match) {
                        const idx = parseInt(match[1]) - 1;
                        if (idx >= 0 && idx < subs.length) {
                            const translated = match[2].trim();
                            if (translated.length > subs[idx].text.length * 3) {
                                console.warn('합쳐진 번역 의심:', idx + 1, translated);
                            } else {
                                subs[idx].kr = translated;
                                parsed.push(idx);
                            }
                        }
                    }
                });

                if (parsed.length !== expectedCount && attempts < 3) {
                    console.warn('개수 불일치:', parsed.length + '/' + expectedCount, '재시도');
                    batch.forEach((_, j) => { delete subs[i + j].kr; });
                    continue;
                }

                const batchIndices = batch.map((_, j) => i + j);
                const missing = batchIndices.filter(idx => !parsed.includes(idx));

                if (missing.length === 0) {
                    success = true;
                } else if (attempts < 3) {
                    console.warn('배치 재시도 (누락 ' + missing.length + '개), 시도 ' + (attempts + 1));
                    batch.forEach((_, j) => { delete subs[i + j].kr; });
                    continue;
                } else {
                    success = true;
                }
            } catch (err) {
                console.error('번역 배치 실패:', i, err);
                // 🚨 1. 키가 틀렸거나 요금이 없는 '치명적 에러' (401, 403)
                // -> 어차피 계속해봤자 안 되니까 즉시 파업! (이땐 결제 전이라 토큰 안 깎임)
                if (err.message.includes('401') || err.message.includes('403') || err.message.includes('에러')) {
                    throw err; 
                }
                // 🌟 2. Claude가 양식을 안 지키거나 통신이 일시적으로 끊긴 '단순 에러'
                // -> 토큰 낭비를 막기 위해 3번 시도 후 '스킵'하고 다음 대사로 진행!
                if (attempts >= 3) success = true;
            }
        }
    }

    // 최종 누락분 재시도
    const missed = subs.filter(s => !s.kr);
    if (missed.length > 0 && missed.length < 20) {
        const numberedLines = missed.map(s => (subs.indexOf(s) + 1) + '|' + s.text).join('\n---\n');
        setTitle('최종 누락분 ' + missed.length + '개 재번역...');
        try {
            const res = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': anthropicKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true'
                },
                body: JSON.stringify({
                    model: 'claude-sonnet-4-20250514',
                    // model: 'claude-3-5-haiku-latest',
                    max_tokens: 4096,
                    
                    // 캐싱 적용
                    system: [
                        {
                            type: "text",
                            text: claudeSystemPrompt,
                            cache_control: { type: "ephemeral" }
                        }
                    ],
                    messages: [{
                        role: 'user',
                        content: '다음 자막을 한국어로 번역해.\n규칙: 각 번호는 ---로 구분된 독립된 대사임. 번호 하나당 번역 결과도 정확히 하나. 절대 합치지 말 것. 번호|번역 형식으로만 응답.\n\n' + numberedLines
                    }]
                })
            });
            const data = await res.json();
            data.content[0].text.split('\n').filter(l => l.match(/^\d+\|/)).forEach(line => {
                const match = line.match(/^(\d+)\|(.+)/);
                if (match) {
                    const idx = parseInt(match[1]) - 1;
                    if (idx >= 0 && idx < subs.length) subs[idx].kr = match[2].trim();
                }
            });
        } catch (err) { }
    }

    return subs;
}

let openaiKey = '';
let anthropicKey = '';

// ── 커스텀 API 키 모달 로직 ──
const apiModal = document.getElementById('apiModal');
const openaiInput = document.getElementById('openaiInput');
const anthropicInput = document.getElementById('anthropicInput');
const btnCancelApi = document.getElementById('btnCancelApi');
const btnConfirmApi = document.getElementById('btnConfirmApi');
const keyIcon = document.querySelector('.key-icon');

// 모달 열기 (기존 키가 있으면 인풋창에 채워줌)
function openApiModal() {
    openaiInput.value = openaiKey;
    anthropicInput.value = anthropicKey;
    apiModal.classList.add('active');
}

// 모달 닫기
function closeApiModal() {
    apiModal.classList.remove('active');
}

// 열쇠 버튼 누르면 모달 열림
document.getElementById('keyBtn').addEventListener('click', openApiModal);

// 취소 버튼 누르면 닫힘
btnCancelApi.addEventListener('click', closeApiModal);

// 모달 바깥쪽(어두운 배경) 클릭해도 닫히게 설정
apiModal.addEventListener('click', (e) => {
    if (e.target === apiModal) closeApiModal();
});

// 확인 버튼 누르면 변수에 키 저장 & 열쇠 아이콘 파란색 점등
btnConfirmApi.addEventListener('click', () => {
    openaiKey = openaiInput.value.trim();
    anthropicKey = anthropicInput.value.trim();
    
    if (openaiKey || anthropicKey) {
        keyIcon.style.background = 'var(--light-blue)';
    } else {
        keyIcon.style.background = 'transparent';
    }
    
    closeApiModal();
    updateWaitingMessage();
});

const titleSpan = document.getElementById('titleSpan');

let tracks = [];
let currentTrack = 0;
let mergedAudioUrl = null;

function checkMarquee() {
    const container = titleText;
    const span = titleSpan;
    span.style.paddingLeft = '0';
    container.classList.remove('scrolling');
    if (span.scrollWidth > container.clientWidth) {
        span.style.paddingLeft = '40%';
        container.classList.add('scrolling');
    }
}

function setTitle(text) {
    titleSpan.textContent = text;
    checkMarquee();
}

async function mergeAudioFiles(files) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const buffers = [];
    for (let i = 0; i < files.length; i++) {
        setTitle('DECODING TRACK ' + (i + 1) + '/' + files.length + '...');
        await new Promise(r => setTimeout(r, 50));
        const arrayBuf = await files[i].arrayBuffer();
        const decoded = await audioCtx.decodeAudioData(arrayBuf);
        buffers.push(decoded);
    }
    setTitle('MERGING ' + files.length + ' TRACKS...');
    await new Promise(r => setTimeout(r, 50));
    const totalLength = buffers.reduce((sum, b) => sum + b.length, 0);
    const sampleRate = buffers[0].sampleRate;
    const channels = buffers[0].numberOfChannels;
    const merged = audioCtx.createBuffer(channels, totalLength, sampleRate);
    let offset = 0;
    for (const buf of buffers) {
        for (let ch = 0; ch < channels; ch++) {
            merged.getChannelData(ch).set(buf.getChannelData(ch), offset);
        }
        offset += buf.length;
    }
    audioCtx.close();
    setTitle('CONVERTING...');
    await new Promise(r => setTimeout(r, 50));
    const wavBlob = bufferToWav(merged);
    return URL.createObjectURL(wavBlob);
}

// ── AudioBuffer를 WAV Blob으로 변환 ──
function bufferToWav(buffer) {
    const numCh = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length * numCh * 2 + 44;
    const out = new ArrayBuffer(length);
    const view = new DataView(out);
    let pos = 0;
    function writeStr(s) { for (let i = 0; i < s.length; i++) view.setUint8(pos++, s.charCodeAt(i)); }
    function writeU32(v) { view.setUint32(pos, v, true); pos += 4; }
    function writeU16(v) { view.setUint16(pos, v, true); pos += 2; }
    writeStr('RIFF');
    writeU32(length - 8);
    writeStr('WAVE');
    writeStr('fmt ');
    writeU32(16);
    writeU16(1);
    writeU16(numCh);
    writeU32(sampleRate);
    writeU32(sampleRate * numCh * 2);
    writeU16(numCh * 2);
    writeU16(16);
    writeStr('data');
    writeU32(length - 44);
    for (let i = 0; i < buffer.length; i++) {
        for (let ch = 0; ch < numCh; ch++) {
            let sample = buffer.getChannelData(ch)[i];
            sample = Math.max(-1, Math.min(1, sample));
            view.setInt16(pos, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            pos += 2;
        }
    }
    return new Blob([out], { type: 'audio/wav' });
}

window.addEventListener('resize', checkMarquee);
checkMarquee();

let isPlaying = false;
let audioLoaded = false;

function fmt(s) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
}

function updateProgress() {
    if (!audio.duration) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    progressFill.style.width = pct + '%';
    progressThumb.style.left = pct + '%';
    timeCurrent.textContent = fmt(audio.currentTime);
}

audioInput.addEventListener('change', async e => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    tracks = files;
    audioIcon.style.background = 'var(--blue)';
    const name = files.length > 1
        ? files[0].name.replace(/\.[^.]+$/, '').toUpperCase() + ' 외 ' + (files.length - 1) + '트랙'
        : files[0].name.replace(/\.[^.]+$/, '').toUpperCase();
    setTitle(name);
    const cover = document.getElementById('coverImg');
    jsmediatags.read(files[0], {
        onSuccess: tag => {
            const pic = tag.tags.picture;
            if (pic) {
                const bytes = new Uint8Array(pic.data);
                const blob = new Blob([bytes], { type: pic.format });
                const imgUrl = URL.createObjectURL(blob);
                cover.style.backgroundImage = 'url(' + imgUrl + ')';
                cover.style.backgroundSize = 'cover';
                cover.style.backgroundPosition = 'center';
                cover.textContent = '';
            }
            if (tag.tags.title) {
                const t = tag.tags.title.toUpperCase();
                const artist = tag.tags.artist ? ' - ' + tag.tags.artist.toUpperCase() : '';
                setTitle(t + artist);
            }
        },
        onError: () => { }
    });
    if (files.length > 1) {
        setTitle('MERGING ' + files.length + ' TRACKS...');
        mergedAudioUrl = await mergeAudioFiles(files);
        audio.src = mergedAudioUrl;
        audioLoaded = true;
        updateWaitingMessage();
        setTitle(name);
    } else {
        audio.src = URL.createObjectURL(files[0]);
        audioLoaded = true;
        updateWaitingMessage();
    }
    // if (openaiKey && anthropicKey) {
    //     let runSTT = true;
    //     if (subtitles.length) {
    //         runSTT = confirm('이미 자막이 있습니다. 새로 생성할까요?');
    //     }
    //     if (runSTT) {
    //         const subs = await transcribeAll(files);
    //         const translated = await translateSubtitles(subs);
    //         renderSubtitles(translated);
    //         setTitle(name);
    //     }
    // }
});

audio.addEventListener('loadedmetadata', () => {
    timeTotal.textContent = fmt(audio.duration);
    timeCurrent.textContent = '0:00';
});

audio.addEventListener('timeupdate', updateProgress);

audio.addEventListener('ended', () => {
    isPlaying = false;
    playIcon.style.cssText = 'width:0;height:0;border-top:9px solid transparent;border-bottom:9px solid transparent;border-left:14px solid var(--cream);margin-left:3px;';
});

btnPlay.addEventListener('click', () => {
    if (!audioLoaded) return;
    const icon = document.getElementById('playIcon');
    if (isPlaying) {
        audio.pause();
        isPlaying = false;
        icon.innerHTML = '';
        icon.style.cssText = 'width:0;height:0;border-top:7px solid transparent;border-bottom:7px solid transparent;border-left:11px solid var(--cream);margin-left:2px;';
    } else {
        audio.play();
        isPlaying = true;
        icon.style.cssText = 'width:12px;height:14px;display:flex;gap:3px;align-items:stretch;margin:0;border:none;';
        icon.innerHTML = '<span style="flex:1;background:var(--cream);"></span><span style="flex:1;background:var(--cream);"></span>';
    }
});

btnBack.addEventListener('click', () => {
    if (!audioLoaded) return;
    audio.currentTime = Math.max(0, audio.currentTime - 10);
});

btnFwd.addEventListener('click', () => {
    if (!audioLoaded) return;
    audio.currentTime = Math.min(audio.duration, audio.currentTime + 10);
});

progressBar.addEventListener('click', e => {
    if (!audioLoaded) return;
    const rect = progressBar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pct * audio.duration;
});

let dragging = false;
progressThumb.addEventListener('mousedown', e => { if (audioLoaded) dragging = true; e.preventDefault(); });
window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const rect = progressBar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pct * audio.duration;
});
window.addEventListener('mouseup', () => { dragging = false; });

document.querySelectorAll('.setting-option').forEach(opt => {
    opt.addEventListener('click', () => {
        const group = opt.dataset.group;
        document.querySelectorAll(`.setting-option[data-group="${group}"]`).forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        if (group === 'speed') {
            audio.playbackRate = parseFloat(opt.dataset.value);
        }
        if (group === 'subtitle') {
            const mode = opt.dataset.value;
            document.querySelectorAll('.subtitle-kr').forEach(el => {
                el.style.display = (mode === 'en') ? 'none' : 'block';
            });
            document.querySelectorAll('.subtitle-en').forEach(el => {
                el.style.display = (mode === 'kr') ? 'none' : 'block';
            });
        }

        // 스포일러 모드 토글
        if (group === 'spoiler') {
            const area = document.querySelector('.subtitle-area');
            if (opt.dataset.value === 'on') {
                area.classList.add('spoiler-on');
            } else {
                area.classList.remove('spoiler-on');
            }
        }
    });
});

// ── SRT 파서 ──
function parseSRT(text) {
    const blocks = text.trim().replace(/\r\n/g, '\n').split('\n\n');
    return blocks.map(block => {
        const lines = block.split('\n');
        if (lines.length < 3) return null;
        const times = lines[1].split(' --> ');
        const textLines = lines.slice(2);
        if (textLines.length >= 2) {
            return {
                start: srtTimeToSec(times[0]),
                end: srtTimeToSec(times[1]),
                text: textLines[0],
                kr: textLines[1]
            };
        } else {
            return {
                start: srtTimeToSec(times[0]),
                end: srtTimeToSec(times[1]),
                text: textLines[0]
            };
        }
    }).filter(Boolean);
}

function srtTimeToSec(str) {
    const [h, m, rest] = str.trim().split(':');
    const [s, ms] = rest.split(',');
    return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;
}

// ── 자막 렌더링 ──
let subtitles = [];

function renderSubtitles(subs) {
    subtitles = subs;
    const area = document.querySelector('.subtitle-area');
    area.innerHTML = '';
    area.style.justifyContent = '';
    const topSpacer = document.createElement('div');
    topSpacer.style.minHeight = '50%';
    area.appendChild(topSpacer);

    subs.forEach((sub, i) => {
        const line = document.createElement('div');
        line.className = 'subtitle-line';
        line.dataset.index = i;

        const en = document.createElement('div');
        en.className = 'subtitle-en';
        en.textContent = sub.text;

        const kr = document.createElement('div');
        kr.className = 'subtitle-kr';
        kr.textContent = sub.kr || '';

        line.appendChild(kr);
        line.appendChild(en);

        // 클릭하면 해당 시간으로 이동
        line.addEventListener('click', () => {
            if (audioLoaded) {
                audio.currentTime = sub.start;
            }
        });

        area.appendChild(line);
    });

    const bottomSpacer = document.createElement('div');
    bottomSpacer.style.minHeight = '50%';
    area.appendChild(bottomSpacer);

    // 현재 자막 표시 설정 적용
    const mode = document.querySelector('.setting-option[data-group="subtitle"].active').dataset.value;
    area.querySelectorAll('.subtitle-kr').forEach(el => {
        el.style.display = (mode === 'en') ? 'none' : 'block';
    });
    area.querySelectorAll('.subtitle-en').forEach(el => {
        el.style.display = (mode === 'kr') ? 'none' : 'block';
    });

    // 첫 번째 줄을 중앙으로
    const firstLine = area.querySelector('.subtitle-line');
    if (firstLine) {
        firstLine.classList.add('active');
        const offset = firstLine.offsetTop - (area.clientHeight / 2) + (firstLine.clientHeight / 2);
        area.scrollTo({ top: offset });
    }
}

// ── 타임싱크 ──
let lastActiveIndex = -1;
let lastRevealedIndex = -1; // 💡 스포일러가 해제된 최신 위치를 기억할 변수 추가!

function syncSubtitles() {
    if (!subtitles.length) return;
    const t = audio.currentTime;
    let activeIndex = -1;
    let revealedIndex = -1;

    // 1. 현재 타이밍 계산
    for (let i = 0; i < subtitles.length; i++) {
        // 현재 시간(t)이 자막 시작 시간보다 뒤에 있다면 일단 '밝혀진(revealed)' 상태로 갱신
        if (t >= subtitles[i].start) {
            revealedIndex = i;
        }
        // 정확히 말하고 있는 시간대라면 '활성화(active)' 상태로 지정
        if (t >= subtitles[i].start && t < subtitles[i].end) {
            activeIndex = i;
        }
    }

    const area = document.querySelector('.subtitle-area');

    // 2. 스포일러(밝혀짐) 상태 업데이트 (바뀌었을 때만 실행해서 성능 최적화)
    if (revealedIndex !== lastRevealedIndex) {
        lastRevealedIndex = revealedIndex;
        area.querySelectorAll('.subtitle-line').forEach((el, idx) => {
            if (idx <= revealedIndex) {
                el.classList.add('revealed'); // 지나온 대사들은 revealed 클래스 추가
            } else {
                el.classList.remove('revealed');
            }
        });
    }

    // 3. 현재 재생 중인 대사 하이라이트 및 스크롤 (기존 로직과 동일)
    if (activeIndex !== lastActiveIndex) {
        lastActiveIndex = activeIndex;
        area.querySelectorAll('.subtitle-line').forEach(el => el.classList.remove('active'));

        if (activeIndex >= 0) {
            const activeLine = area.querySelector(`.subtitle-line[data-index="${activeIndex}"]`);
            if (activeLine) {
                activeLine.classList.add('active');
                const areaRect = area.getBoundingClientRect();
                const lineRect = activeLine.getBoundingClientRect();
                const offset = lineRect.top - areaRect.top + area.scrollTop - (area.clientHeight / 2) + (activeLine.clientHeight / 2);
                area.scrollTo({ top: offset, behavior: 'smooth' });
            }
        }
    }
}

function syncLoop() {
    syncSubtitles();
    requestAnimationFrame(syncLoop);
}
requestAnimationFrame(syncLoop);

// ── SRT 내보내기 ──
document.getElementById('exportSrtBtn').addEventListener('click', () => {
    if (!subtitles.length) return;
    let srt = '';
    subtitles.forEach((sub, i) => {
        srt += (i + 1) + '\n';
        srt += secToSrtTime(sub.start) + ' --> ' + secToSrtTime(sub.end) + '\n';
        srt += sub.text + '\n';
        if (sub.kr) srt += sub.kr + '\n';
        srt += '\n';
    });
    const blob = new Blob([srt], { type: 'text/plain' });
    const defaultName = 'subtitles_' + Date.now();
    const fileName = prompt('파일명을 입력하세요', defaultName);
    if (fileName === null) return;
    const link = document.createElement('a');
    link.download = (fileName || defaultName) + '.srt';
    link.href = URL.createObjectURL(blob);
    link.click();
});

function secToSrtTime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.round((sec % 1) * 1000);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + ',' + String(ms).padStart(3, '0');
}

// ── SRT 파일 로드 ──
document.getElementById('srtInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById('srtIcon').style.background = 'var(--light-blue)';
    const reader = new FileReader();
    reader.onload = ev => {
        const subs = parseSRT(ev.target.result);
        renderSubtitles(subs);
    };
    reader.readAsText(file);
});

// ── 수동 자막 생성 로직 ──
document.getElementById('generateBtn').addEventListener('click', async () => {
    // 1. 방어 로직: 오디오 파일이 없거나 키가 없으면 튕겨냄
    if (!audioLoaded || !tracks.length) {
        alert('먼저 오디오 파일(AUDIO)을 업로드해주세요!');
        return;
    }
    if (!openaiKey || !anthropicKey) {
        alert('우측 상단의 열쇠 버튼을 눌러 API 키를 먼저 입력해주세요!');
        return;
    }

    // 2. 이미 자막이 있을 경우 경고
    let runSTT = true;
    if (subtitles.length) {
        runSTT = confirm('이미 자막이 있습니다. 새로 번역을 돌릴까요?\n(진행 시 기존 자막은 삭제되고 토큰이 소모됩니다.)');
    }

    // 3. 실행 승인 시 본격적인 STT + 번역 시작
    if (runSTT) {
        document.getElementById('generateIcon').style.background = 'var(--blue)'; // 버튼에 파란색 불 켜기

        // 화면을 다시 "물질화 대기 중" 상태로 변경 
        const area = document.querySelector('.subtitle-area');
        area.style.justifyContent = 'center';
        area.innerHTML = `
            <div class="subtitle-line active" style="text-align: center; opacity: 0.7; background: var(--light-blue);">
              <div class="subtitle-kr">자막 물질화 대기 중...<br>타임 볼텍스를 통과하며 번역 중입니다. <br>잠시만 기다려주세요.</div>
              <div class="subtitle-en">Waiting for subtitle materialization...<br>Translation in progress. Please wait.</div>
            </div>
        `;
        
        try {
            const subs = await transcribeAll(tracks);
            const translated = await translateSubtitles(subs);
            renderSubtitles(translated);
            
            // 번역이 끝나면 타이틀바 원래 이름으로 복구
            const name = tracks.length > 1
                ? tracks[0].name.replace(/\.[^.]+$/, '').toUpperCase() + ' 외 ' + (tracks.length - 1) + '트랙'
                : tracks[0].name.replace(/\.[^.]+$/, '').toUpperCase();
            setTitle(name);
        } catch (error) {
            console.error('번역 중 에러 발생:', error);
            alert('자막 생성에 실패했습니다.\n\n[가능성 높은 원인]\n1. API 키를 잘못 입력했거나 만료됨\n2. 오디오 파일에 음성이 없음\n\n우측 상단의 열쇠(🔑) 버튼을 눌러 API 키가 정확한지 다시 확인해 보세요!');

            // 에러가 났을 때 안내 문구 원상복구
            subtitles = []; 
            updateWaitingMessage(); 

            // 🚨 타이틀바도 원래 오디오 이름으로 복구!
            const name = tracks.length > 1
                ? tracks[0].name.replace(/\.[^.]+$/, '').toUpperCase() + ' 외 ' + (tracks.length - 1) + '트랙'
                : tracks[0].name.replace(/\.[^.]+$/, '').toUpperCase();
            setTitle(name);

        } finally {
            document.getElementById('generateIcon').style.background = 'transparent'; // 끝난 후 불 끄기
        }
    }
});

// ── 안내 문구(대기 화면) 동적 업데이트 ──
function updateWaitingMessage() {
    // 이미 자막이 생성되어 화면에 뿌려진 상태라면 작동하지 않음
    if (subtitles.length > 0) return;

    const waitingKr = document.querySelector('.subtitle-area .subtitle-kr');
    const waitingEn = document.querySelector('.subtitle-area .subtitle-en');
    const waitingLine = document.querySelector('.subtitle-area .subtitle-line');

    // 만약 요소를 못 찾으면 (이미 다른 자막으로 덮어씌워졌으면) 패스
    if (!waitingKr || !waitingEn || !waitingLine) return;

    if (audioLoaded && openaiKey && anthropicKey) {
        // 🌟 모든 준비가 끝났을 때!
        waitingKr.textContent = "타디스 번역 회로 연결 완료! \n[GENERATE]를 눌러 자막을 생성하거나 \n[SRT] 자막을 로드하세요.";
        waitingEn.textContent = "Translation circuits connected! \nPress [GENERATE] or load an [SRT] file.";
        waitingLine.style.opacity = '0.5';
    } else if (audioLoaded && (!openaiKey || !anthropicKey)) {
        // 오디오만 있고 키가 없을 때
        waitingKr.textContent = "오디오 스캔 완료. [SRT] 자막을 넣거나, \n우측 상단의 [🔑]을 눌러 API 키를 입력하세요.";
        // TODO: 키 입력 문구 변경 필요! api키가 필수가 아님!!
        waitingEn.textContent = "Audio scanned. Load [SRT] subtitles, or enter API keys [🔑] to generate.";
        waitingLine.style.opacity = '0.5';
    } else if (!audioLoaded && (openaiKey && anthropicKey)) {
        // 키만 있고 오디오가 없을 때
        waitingKr.textContent = "API 키 입력 확인. \n[AUDIO] 폴더를 눌러 오디오를 넣으세요.";
        waitingEn.textContent = "Keys verified. Press [AUDIO] to inject audio data.";
        waitingLine.style.opacity = '0.5';
    } else {
        // 둘 다 없을 때 (초기 상태)
        waitingKr.textContent = "자막 물질화 대기 중... \n[AUDIO]나 [SRT]를 로드하거나, [🔑]로 번역 회로를 연결하세요.";
        waitingEn.textContent = "Waiting for subtitle materialization... \nLoad [AUDIO]/[SRT], or connect circuits via [🔑].";
        waitingLine.style.opacity = '0.5';
    }
}