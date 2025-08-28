// --- State Variables and DOM Elements ---
const startButton = document.getElementById("start-button");
const newTopicButton = document.getElementById("new-topic-button");
const timerDisplay = document.getElementById("timer-display");
const statusMessage = document.getElementById("status-message");
const transcriptionText = document.getElementById("transcription-text");
const assessmentResult = document.getElementById("assessment-result");
const topicTitleElement = document.getElementById("topic-title");
const topicPromptsElement = document.getElementById("topic-prompts");
const micLevelContainer = document.getElementById("mic-level-container");
const micLevelBar = document.getElementById("mic-level-bar");

// --- Topics data will be loaded from a JSON file
let topics = []; // Now stores a flattened array of all topics
let currentPhase = "idle";
let timer = 0;
let intervalId = null;
let recognition = null;
let isAssessing = false;
let micPermissionGranted = false;
let usedTopics = [];

let audioContext = null;
let analyser = null;
let microphoneStream = null;
let animationFrameId = null;
let isStoppedManually = false;

// --- New function to load data and initialize the app
async function loadTopicsAndInitialize() {
  try {
    const response = await fetch("./topics.json");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    // --- NEW LOGIC TO HANDLE YOUR JSON STRUCTURE ---
    // Iterate through the keys of the JSON object and flatten the array
    if (data && typeof data === "object" && !Array.isArray(data)) {
      for (const category in data) {
        if (Array.isArray(data[category])) {
          // Push each topic object into our main topics array
          data[category].forEach(topicItem => {
            // Adjust the object structure to match the script's expectations
            topics.push({
              topic: topicItem.topic,
              prompts: topicItem.cues // Renaming 'cues' to 'prompts' for consistency
            });
          });
        }
      }
      initializeApp();
    } else {
      throw new Error("JSON file does not contain the expected object structure.");
    }
  } catch (error) {
    console.error("Error fetching topics:", error);
    statusMessage.textContent =
      "Failed to load speaking topics. Please ensure topics.json is in the correct folder and has the correct format.";
    startButton.disabled = true;
    newTopicButton.disabled = true;
  }
}

// --- New Initialization Function
function initializeApp() {
  // Function to update the button's appearance based on the current state
  function updateButtonAppearance() {
    startButton.classList.remove("button-red", "button-yellow", "button-green");
    if (currentPhase === "idle") {
      startButton.classList.add("button-red");
      startButton.textContent = "Start Practice";
      newTopicButton.disabled = false;
      newTopicButton.classList.remove("bg-gray-400", "cursor-not-allowed");
    } else if (currentPhase === "preparation") {
      startButton.classList.add("button-red");
      startButton.textContent = "Preparation time";
      newTopicButton.disabled = true;
      newTopicButton.classList.add("bg-gray-400", "cursor-not-allowed");
    } else if (currentPhase === "ready") {
      startButton.classList.add("button-yellow");
      startButton.textContent = "Get Ready...";
      newTopicButton.disabled = true;
      newTopicButton.classList.add("bg-gray-400", "cursor-not-allowed");
    } else if (currentPhase === "speaking") {
      startButton.classList.add("button-green");
      startButton.textContent = "Speaking...";
      newTopicButton.disabled = true;
      newTopicButton.classList.add("bg-gray-400", "cursor-not-allowed");
    }
  }

  // --- Web Speech Recognition API Setup ---
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    statusMessage.textContent =
      "Speech Recognition is not supported by your browser. Try Chrome or Edge.";
    startButton.disabled = true;
    startButton.classList.remove("button-red");
    startButton.classList.add("bg-gray-400");
  } else {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join("");
      transcriptionText.value = transcript;
      console.log("Transcription updated:", transcript);
    };

    recognition.onend = () => {
      console.log("Speech recognition stopped.");
      if (isStoppedManually) {
        statusMessage.textContent = "Recording finished. Getting assessment...";
        if (transcriptionText.value.length > 0 && !isAssessing) {
          assessWithOllama(transcriptionText.value);
        } else {
          console.log("No text to send for assessment.");
          statusMessage.textContent =
            "No speech detected. Ready for a new practice session.";
          resetToIdleState(); // Call the new reset function
        }
        isStoppedManually = false;
      } else {
        console.log("Speech recognition stopped prematurely. Restarting.");
        if (currentPhase === "speaking") {
          recognition.start();
        }
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      statusMessage.textContent = `Error: ${event.error}. Please ensure microphone access is granted.`;
      stopAllProcesses();
    };
  }

  // --- Main Control Functions ---
  async function startPractice() {
    if (currentPhase !== "idle") {
      return;
    }

    console.log("Starting practice session.");
    resetUI();

    displayRandomTopic();
    currentPhase = "preparation";
    timer = 60;
    updateTimerDisplay();
    updateButtonAppearance();
    statusMessage.textContent =
      "Preparation time. Take one minute to prepare your answer.";
    startButton.disabled = true;

    intervalId = setInterval(() => {
      timer--;
      updateTimerDisplay();
      if (timer <= 0) {
        clearInterval(intervalId);
        startReadyPhase();
      }
    }, 1000);
  }

  function startReadyPhase() {
    currentPhase = "ready";
    timer = 10;
    updateTimerDisplay();
    updateButtonAppearance();
    statusMessage.textContent =
      "Get ready to speak... Recording will start in...";

    intervalId = setInterval(() => {
      timer--;
      updateTimerDisplay();
      if (timer <= 0) {
        clearInterval(intervalId);
        startSpeakingPhase();
      }
    }, 1000);
  }

  async function startSpeakingPhase() {
    currentPhase = "speaking";
    timer = 120; // 2 minutes
    updateTimerDisplay();
    updateButtonAppearance();
    statusMessage.textContent = "Speaking time. Please start speaking now.";

    try {
      await startAudioAnalysis();
      recognition.start();
    } catch (error) {
      console.error("Failed to start recording:", error);
      statusMessage.textContent =
        "Failed to start recording. Check microphone permissions.";
      stopAllProcesses();
    }

    intervalId = setInterval(() => {
      timer--;
      updateTimerDisplay();
      if (timer <= 0) {
        console.log("Speaking time is up. Stopping all processes.");
        stopAllProcesses();
      }
    }, 1000);
  }

  function stopAllProcesses() {
    clearInterval(intervalId);
    if (recognition) {
      isStoppedManually = true;
      recognition.stop();
    }
    stopAudioAnalysis();
  }

  // The new function to handle the final state reset
  function resetToIdleState() {
    currentPhase = "idle";
    isAssessing = false;
    startButton.disabled = false;
    statusMessage.textContent = "Ready to begin.";
    micLevelContainer.classList.add("hidden");
    updateButtonAppearance();
  }

  // This function now only handles UI state for a new session
  function resetUI() {
    transcriptionText.value = "";
    assessmentResult.innerHTML =
      '<p class="text-gray-500">The assessment will be shown here after you finish speaking.</p>';
  }

  function updateTimerDisplay() {
    const minutes = Math.floor(timer / 60);
    const seconds = timer % 60;
    timerDisplay.textContent = `${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  // Function to display a random, unused topic
  function displayRandomTopic() {
    const unusedTopics = topics.filter(
      (topic) => !usedTopics.includes(topic.topic)
    );

    if (unusedTopics.length === 0) {
      usedTopics = [];
      statusMessage.textContent = "All topics used. Starting over!";
      displayRandomTopic();
      return;
    }

    const randomTopic =
      unusedTopics[Math.floor(Math.random() * unusedTopics.length)];

    topicTitleElement.textContent = randomTopic.topic;
    topicPromptsElement.innerHTML = randomTopic.prompts
      .map((prompt) => `<li>${prompt}</li>`)
      .join("");

    usedTopics.push(randomTopic.topic);
    console.log("New topic selected:", randomTopic.topic);
  }

  // --- Microphone Level Indicator (Web Audio API) ---
  async function startAudioAnalysis() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      microphoneStream = stream;
      audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 256;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      micLevelContainer.classList.remove("hidden");

      const draw = () => {
        animationFrameId = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const level = Math.min(Math.floor(average), 100);
        micLevelBar.style.width = `${level}%`;
      };
      draw();
    } catch (err) {
      console.error("Error getting audio stream:", err);
      statusMessage.textContent =
        "Failed to get microphone access. Please check permissions.";
      throw err;
    }
  }

  function stopAudioAnalysis() {
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
    if (microphoneStream) {
      microphoneStream.getTracks().forEach((track) => track.stop());
      microphoneStream = null;
    }
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    micLevelBar.style.width = "0%";
  }

  // --- Ollama Assessment Function (Placeholder) ---
  async function assessWithOllama(text) {
    if (isAssessing) return;
    isAssessing = true;
    assessmentResult.innerHTML = `
            <div class="flex items-center space-x-2 text-gray-600">
              <svg class="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Analyzing your response...</span>
            </div>
          `;

    console.log("Sending the following text to Ollama:", text);
    const ollamaEndpoint = "http://localhost:11434/api/generate";
    const prompt = `You are an expert IELTS examiner. You are to assess a piece of spoken text based on the official IELTS speaking band descriptors. You should also check if the speaker has fully addressed the topic and answered the prompts correctly. If they did not, this should be reflected in the Fluency and Coherence score. Provide a detailed assessment of the text's Fluency and Coherence, Lexical Resource, Grammatical Range and Accuracy, and Pronunciation. At the very beginning of the response, provide a single, overall band score (e.g., "Overall Band Score: 7.5") followed by a new line. Then, provide specific, actionable feedback on how to improve in each of the four areas. Focus on correcting grammatical errors, suggesting more sophisticated vocabulary or sentence structures, and improving pronunciation.
      **IELTS Speaking Band Descriptors for Reference:**
      **Band 9**
      * **Fluency and coherence:** Speaks fluently with only rare repetition or self-correction; any hesitation is content-related rather than to find words or grammar. Speaks coherently with fully appropriate cohesive features. Develops topics fully and appropriately.
      * **Lexical resource:** Uses vocabulary with full flexibility and precision in all topics. Uses idiomatic language naturally and accurately.
      * **Grammatical range and accuracy:** Uses a full range of structures naturally and appropriately. Produces consistently accurate structures apart from ‘slips’.
      * **Pronunciation:** Uses a full range of pronunciation features with precision and subtlety. Sustains flexible use of features throughout. Is effortless to understand.
      **Band 8**
      * **Fluency and coherence:** Speaks fluently with only occasional repetition or self-correction; hesitation is usually content-related and only rarely to search for language. Develops topics coherently and appropriately.
      * **Lexical resource:** Uses a wide vocabulary resource readily and flexibly to convey precise meaning. Uses less common and idiomatic vocabulary skilfully, with occasional inaccuracies. Uses paraphrase effectively as required.
      * **Grammatical range and accuracy:** Uses a wide range of structures flexibly. Produces a majority of error-free sentences with only very occasional inappropriacies or basic/non-systematic errors.
      * **Pronunciation:** Uses a wide range of pronunciation features. Sustains flexible use of features, with only occasional lapses. Is easy to understand throughout; L1 accent has minimal effect on intelligibility.
      **Band 7**
      * **Fluency and coherence:** Speaks at length without noticeable effort or loss of coherence. May demonstrate language-related hesitation at times, or some repetition and/or self-correction. Uses a range of connectives and discourse markers with some flexibility.
      * **Lexical resource:** Uses vocabulary resource flexibly to discuss a variety of topics. Uses some less common and idiomatic vocabulary and shows some awareness of style and collocation, with some inappropriate choices. Uses paraphrase effectively.
      **Grammatical range and accuracy:** Uses a range of complex structures with some flexibility. Frequently produces error-free sentences, though some grammatical mistakes persist.
      * **Pronunciation:** Shows all the positive features of Band 6 and some, but not all, of the positive features of Band 8.
      **Band 6**
      * **Fluency and coherence:** Is willing to speak at length, though may lose coherence at times due to occasional repetition, self-correction or hesitation. Uses a range of connectives and discourse markers but not always appropriately.
      * **Lexical resource:** Has a wide enough vocabulary to discuss topics at length and make meaning clear in spite of inappropriacies. Generally paraphrases successfully.
      * **Grammatical range and accuracy:** Uses a mix of simple and complex structures, but with limited flexibility. May make frequent mistakes with complex structures, though these rarely cause comprehension problems.
      * **Pronunciation:** Uses a range of pronunciation features with mixed control. Shows some effective use of features but this is not sustained. Can generally be understood throughout, though mispronunciation of individual words or sounds reduces clarity at times.
      **Band 5**
      * **Fluency and coherence:** Usually maintains flow of speech but uses repetition, self correction and/or slow speech to keep going. May over-use certain connectives and discourse markers. Produces simple speech fluently, but more complex communication causes fluency problems.
      * **Lexical resource:** Manages to talk about familiar and unfamiliar topics but uses vocabulary with limited flexibility. Attempts to use paraphrase but with mixed success.
      **Grammatical range and accuracy:** Produces basic sentence forms with reasonable accuracy. Uses a limited range of more complex structures, but these usually contain errors and may cause some comprehension problems.
      * **Pronunciation:** Shows all features of band 4 and some, but not all the positive features of band 6.
      **Band 4**
      * **Fluency and coherence:** Cannot respond without noticeable pauses and may speak slowly, with frequent repetition and self-correction. Links basic sentences but with repetitious use of simple connectives and some breakdowns in coherence.
      * **Lexical resource:** Is able to talk about familiar topics but can only convey basic meaning on unfamiliar topics and makes frequent errors in word choice. Rarely attempts paraphrase.
      * **Grammatical range and accuracy:** Produces basic sentence forms and some correct simple sentences but subordinate structures are rare. Errors are frequent and may lead to misunderstanding.
      * **Pronunciation:** Uses a limited range of pronunciation features. Attempts to control features but lapses are frequent. Mispronunciations are frequent and cause some difficulty for the listener.
      **Band 3**
      * **Fluency and coherence:** Speaks with long pauses. Has limited ability to link simple sentences. Gives only simple responses and is frequently unable to convey basic message.
      * **Lexical resource:** Uses simple vocabulary to convey personal information. Has insufficient vocabulary for less familiar topics.
      * **Grammatical range and accuracy:** Attempts basic sentence forms but with limited success, or relies on apparently memorised utterances. Makes numerous errors except in memorised expressions.
      * **Pronunciation:** Shows some of the features of band 2 and some, but not all, of the positive features of band 4.
      **Band 2**
      * **Fluency and coherence:** Pauses lengthily before most words. Little communication possible.
      * **Lexical resource:** Only produces isolated words or memorised utterances.
      * **Grammatical range and accuracy:** Cannot produce basic sentence forms.
      * **Pronunciation:** Speech is often unintelligible.
      **Band 1**
      * **Fluency and coherence:** No communication possible. No rateable language.
      * **Lexical resource:** No communication possible. No rateable language.
      * **Grammatical range and accuracy:** No communication possible. No rateable language.
      * **Pronunciation:** No communication possible. No rateable language.
      **Band 0**
      * **Fluency and coherence:** Does not attend.
      * **Lexical resource:** Does not attend.
      * **Grammatical range and accuracy:** Does not attend.
      * **Pronunciation:** Does not attend.
      Based on the criteria above, please provide feedback on the following text: "${text}"`;

    try {
      const response = await fetch(ollamaEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama3",
          prompt: prompt,
          stream: false,
        }),
      });

      if (!response.ok) {
        console.error(
          "Ollama API fetch failed with status:",
          response.status
        );
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      console.log("Ollama API request successful. Parsing response...");
      const data = await response.json();
      const assessmentText = data.response;
      console.log("Assessment received from Ollama:", assessmentText);

      const formattedAssessment = assessmentText
        .replace(/\n/g, "<br>")
        .replace(/^-/gm, "&bullet; ")
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

      assessmentResult.innerHTML = formattedAssessment;
    } catch (error) {
      console.error("Ollama API call failed:", error);
      assessmentResult.innerHTML = `<p class="text-red-600">Failed to get assessment. Please ensure your local Ollama server is running and accessible. Error: ${error.message}</p>`;
    } finally {
      // This is the new, critical step to ensure a full reset
      resetToIdleState();
    }
  }

  // --- Request Microphone Permissions on Page Load ---
  async function requestMicrophonePermission() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      micPermissionGranted = true;
      statusMessage.textContent = "Microphone access granted. Ready to begin.";
      startButton.disabled = false;
      stream.getTracks().forEach((track) => track.stop()); // Stop the stream immediately
      console.log("Microphone access granted.");
    } catch (err) {
      micPermissionGranted = false;
      statusMessage.textContent =
        "Microphone access denied. Please allow access in your browser settings to continue.";
      startButton.disabled = true;
      startButton.classList.add(
        "bg-gray-400",
        "hover:bg-gray-400",
        "cursor-not-allowed"
      );
      console.error("Microphone access denied:", err);
    }
  }

  // --- Event Listeners ---
  startButton.addEventListener("click", () => {
    if (micPermissionGranted) {
      startPractice();
    } else {
      requestMicrophonePermission();
    }
  });

  newTopicButton.addEventListener("click", () => {
    if (currentPhase === "idle") {
      displayRandomTopic();
    }
  });

  // Initial setup on page load
  window.onload = function () {
    displayRandomTopic();
    requestMicrophonePermission();
  };
}

// --- Call the new main function to start the app ---
loadTopicsAndInitialize();