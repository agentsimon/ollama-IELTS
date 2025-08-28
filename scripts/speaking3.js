// --- DOM Elements ---
const nextQuestionBtn = document.getElementById("next-question-btn");
const startBtn = document.getElementById("start-listen-btn");
const stopBtn = document.getElementById("stop-listen-btn");
const questionDisplay = document.getElementById("question-display");
const transcriptionDisplay = document.getElementById("transcription-display");
const assessmentResult = document.getElementById("assessment-result");
const statusMessage = document.getElementById("status-message");
const loadingSpinner = document.getElementById("loading-spinner");
const micLevelBar = document.getElementById("mic-level-bar");
const micLevelContainer = document.getElementById("mic-level-container");
const topicNameElement = document.getElementById("topic-name");
const questionCountElement = document.getElementById("question-count");

// --- Global State ---
let allTopics = [];
let availableTopics = [];
let currentTopic = null;
let currentQuestionIndex = 0;
let animationFrameId = null;
let currentQuestionText = "";

// --- Web Speech API Setup ---
const synth = window.speechSynthesis;
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = "en-US";
} else {
  showModal(
    "Speech Recognition is not supported by your browser. Please use Chrome or Edge."
  );
  startBtn.disabled = true;
  nextQuestionBtn.disabled = true;
}

// --- Web Audio API Setup for visualizer ---
let audioContext, analyser, microphone, dataArray;

/**
 * Sets up the microphone visualizer using the Web Audio API.
 * Requests microphone access and connects the audio stream to an analyser.
 */
async function setupMicrophoneVisualizer() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    microphone = audioContext.createMediaStreamSource(stream);

    analyser.fftSize = 256;
    dataArray = new Uint8Array(analyser.frequencyBinCount);

    // Connect the microphone to the analyser
    microphone.connect(analyser);
  } catch (err) {
    console.error("Error accessing microphone:", err);
    showModal(
      "Microphone access denied. Please allow microphone access to use the visualizer and speech recognition."
    );
    startBtn.disabled = true;
  }
}

/**
 * The main animation loop for the microphone level indicator.
 */
function updateMicLevel() {
  analyser.getByteFrequencyData(dataArray);

  // Calculate the average volume
  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) {
    sum += dataArray[i];
  }
  const average = sum / dataArray.length;

  // Normalize the value to a percentage (0-100) and update the bar width
  const normalizedValue = Math.min(100, (average / 128) * 100);
  micLevelBar.style.width = `${normalizedValue}%`;

  animationFrameId = requestAnimationFrame(updateMicLevel);
}

/**
 * Starts the microphone visualizer animation.
 */
function startVisualizer() {
  if (analyser) {
    micLevelContainer.classList.remove("hidden");
    animationFrameId = requestAnimationFrame(updateMicLevel);
  }
}

/**
 * Stops the microphone visualizer animation.
 */
function stopVisualizer() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    micLevelBar.style.width = "0%";
    micLevelContainer.classList.add("hidden");
  }
}

// --- Ollama API Setup ---
const ollamaEndpoint = "http://localhost:11434/api/chat";
const ollamaModel = "llama3";

// The detailed IELTS speaking band descriptors provided by the user
const ieltsPromptGuide = `You are an expert IELTS Speaking examiner. Your task is to provide a detailed assessment of a user's spoken answer based on the following criteria.

  **Part 3 Assessment Criteria:**
  In Part 3, the user's answer should be a general discussion of the topic, avoiding personal examples.
  When assessing the user's response, please evaluate the following:
  - **Generalization:** Does the user discuss the topic in a general manner, rather than focusing on personal or family experiences?
  - **Linking & Phrases:** Does the user use a range of linking words and phrases (e.g., "to begin with," "on the other hand," "in my country most people believe that...") to connect ideas and manage their speech? Are they avoiding overused or meaningless fillers like "um" and "like"?
  - **Extension:** Is the answer well-extended, showing depth and detail?
  - **Grammatical Range:** Does the user demonstrate a wide range of grammatical structures to express complex ideas?
  
  **Assessment Criteria:**
  **Fluency and Coherence:**
  Band 9: Speaks fluently with only rare repetition or self-correction; any hesitation is content-related. Speaks coherently with fully appropriate cohesive features. Develops topics fully and appropriately.
  Band 8: Speaks fluently with only occasional repetition or self-correction; hesitation is usually content-related. Develops topics coherently and appropriately.
  Band 7: Speaks at length without noticeable effort or loss of coherence. May demonstrate language-related hesitation at times. Uses a range of connectives with some flexibility.
  Band 6: Willing to speak at length, though may lose coherence at times due to occasional repetition or hesitation. Uses a range of connectives but not always appropriately.
  Band 5: Usually maintains flow of speech but uses repetition, self correction and/or slow speech to keep going. May over-use certain connectives.
  Band 4: Cannot respond without noticeable pauses and may speak slowly, with frequent repetition and self-correction.
  Band 3: Speaks with long pauses. Has limited ability to link simple sentences. Gives only simple responses.
  Band 2: Pauses lengthily before most words. Little communication possible.
  Band 1: No communication possible. No rateable language.

  **Lexical Resource:**
  Band 9: Uses vocabulary with full flexibility and precision in all topics. Uses idiomatic language naturally and accurately.
  Band 8: Uses a wide vocabulary readily and flexibly. Uses less common and idiomatic vocabulary skilfully, with occasional inaccuracies. Uses paraphrase effectively.
  Band 7: Uses vocabulary flexibly to discuss a variety of topics. Uses some less common and idiomatic vocabulary. Uses paraphrase effectively.
  Band 6: Has a wide enough vocabulary to discuss topics at length and make meaning clear in spite of inappropriacies. Generally paraphrases successfully.
  Band 5: Manages to talk about familiar and unfamiliar topics but uses vocabulary with limited flexibility. Attempts to use paraphrase but with mixed success.
  Band 4: Is able to talk about familiar topics but can only convey basic meaning on unfamiliar topics and makes frequent errors in word choice. Rarely attempts paraphrase.
  Band 3: Uses simple vocabulary to convey personal information. Has insufficient vocabulary for less familiar topics.
  Band 2: Only produces isolated words or memorised utterances.
  Band 1: No communication possible. No rateable language.

  **Grammatical Range and Accuracy:**
  Band 9: Uses a full range of structures naturally and appropriately. Produces consistently accurate structures apart from ‘slips’.
  Band 8: Uses a wide range of structures flexibly. Produces a majority of error-free sentences with only very occasional inappropriacies or basic/non-systematic errors.
  Band 7: Uses a range of complex structures with some flexibility. Frequently produces error-free sentences, though some grammatical mistakes persist.
  Band 6: Uses a mix of simple and complex structures, but with limited flexibility. May make frequent mistakes with complex structures.
  Band 5: Produces basic sentence forms with reasonable accuracy. Uses a limited range of more complex structures, but these usually contain errors.
  Band 4: Produces basic sentence forms and some correct simple sentences but subordinate structures are rare. Errors are frequent.
  Band 3: Attempts basic sentence forms but with limited success, or relies on memorised utterances. Makes numerous errors.
  Band 2: Cannot produce basic sentence forms.
  Band 1: No communication possible. No rateable language.

  **Pronunciation:**
  Band 9: Uses a full range of pronunciation features with precision and subtlety. Sustains flexible use of features throughout. Is effortless to understand.
  Band 8: Uses a wide range of pronunciation features. Sustains flexible use of features, with only occasional lapses. Is easy to understand throughout; L1 accent has minimal effect on intelligibility.
  Band 7: Shows all the positive features of Band 6 and some, but not all, of the positive features of Band 8.
  Band 6: Uses a range of pronunciation features with mixed control. Can generally be understood throughout.
  Band 5: Shows all features of band 4 and some, but not all the positive features of band 6.
  Band 4: Uses a limited range of pronunciation features. Mispronunciations are frequent and cause some difficulty for the listener.
  Band 3: Shows some of the features of band 2 and some, but not all, of the positive features of band 4.
  Band 2: Speech is often unintelligible.
  Band 1: No communication possible. No rateable language.

  Your assessment must be formatted as follows, providing a score for each criterion and an overall band score. You must also provide specific, actionable advice for improvement based on the transcript.

  **Assessment:**
  **Fluency and Coherence:** [Band Score]
  **Lexical Resource:** [Band Score]
  **Grammatical Range and Accuracy:** [Band Score]
  **Pronunciation:** [Band Score]
  **Overall Band Score:** [Overall Score]

  **Advice:**
  [Detailed, specific advice on how to improve, including feedback on generalization, linking, and grammar.]`;

// --- Functions ---

/**
 * Custom modal to display messages instead of alert().
 * @param {string} message The message to display.
 */
function showModal(message) {
  const modal = document.getElementById("modal");
  const modalMessage = document.getElementById("modal-message");
  modalMessage.textContent = message;
  modal.style.display = "flex";
}

/**
 * Closes the custom modal.
 */
function closeModal() {
  const modal = document.getElementById("modal");
  modal.style.display = "none";
}

/**
 * Updates the state of the control buttons.
 * @param {boolean} next Whether the next question button is enabled.
 * @param {boolean} start Whether the start listening button is enabled.
 * @param {boolean} stop Whether the stop listening button is enabled.
 */
function updateButtons(next, start, stop) {
  nextQuestionBtn.disabled = !next;
  startBtn.disabled = !start;
  stopBtn.disabled = !stop;

  // Add or remove the visual disabled style and grayscale effect
  nextQuestionBtn.classList.toggle("disabled-style", !next);
  startBtn.classList.toggle("disabled-style", !start);
  stopBtn.classList.toggle("disabled-style", !stop);
}

/**
 * Resets the available topics by copying from the master list.
 */
function resetTopics() {
  availableTopics = JSON.parse(JSON.stringify(allTopics));
}

/**
 * Reads the next random question from the available topics and speaks it aloud.
 */
function readQuestion() {
  // Check if all questions from a topic have been asked
  if (
    !currentTopic ||
    currentQuestionIndex >= currentTopic.questions.length
  ) {
    // If so, get a new topic
    if (availableTopics.length === 0) {
      resetTopics(); // If all topics are used, start over
    }
    const randomIndex = Math.floor(Math.random() * availableTopics.length);
    currentTopic = availableTopics.splice(randomIndex, 1)[0];
    currentQuestionIndex = 0;
    topicNameElement.textContent = `Topic: ${currentTopic.topic}`;
    // Change button text back to "Next Question"
    nextQuestionBtn.textContent = "Next Question";
  }

  const question = currentTopic.questions[currentQuestionIndex];
  // Store the question text for later use in the prompt
  currentQuestionText = question;

  // Update the question count display
  questionCountElement.textContent = `Question ${
    currentQuestionIndex + 1
  } of ${currentTopic.questions.length}`;

  // Display a temporary message while the question is being read
  questionDisplay.textContent = "Question is being read...";
  transcriptionDisplay.textContent = "";
  assessmentResult.textContent = "";
  statusMessage.textContent = "Please wait for the question to finish...";
  updateButtons(false, false, false);

  const utterance = new SpeechSynthesisUtterance(question);
  utterance.lang = "en-US";
  utterance.onend = () => {
    // Now, after the question is spoken, hide the text and update the status
    questionDisplay.textContent = "Your turn to speak!";
    // Enable the Start Answer button after the question is read
    updateButtons(false, true, false);
    statusMessage.textContent =
      "Ready to record. Press 'Start Answer' when you are ready.";
  };
  synth.speak(utterance);
  currentQuestionIndex++;
}

/**
 * Starts the speech recognition process.
 */
function startListening() {
  if (!recognition) return;
  recognition.start();
  startVisualizer();
  statusMessage.textContent =
    "Listening... Press 'Stop Listening' when you're done.";
  updateButtons(false, false, true);
}

/**
 * Stops the speech recognition process.
 */
function stopListening() {
  if (!recognition) return;
  recognition.stop();
  stopVisualizer();
  statusMessage.textContent = "Processing your answer...";
  updateButtons(false, false, false);
  loadingSpinner.classList.remove("hidden");
  assessmentResult.textContent = ""; // Clear previous results
}

/**
 * Sends the user's transcribed text to the local Ollama model for assessment.
 * @param {string} transcript The transcribed text from the user's speech.
 */
async function sendToOllama(transcript) {
  // Use the stored question text, not the text currently on the display
  const questionForAssessment = currentQuestionText;

  // Check if the user is asking to rephrase the question
  const rephraseKeywords = [
    "i don't understand",
    "can you repeat that",
    "could you rephrase",
    "repeat the question",
    "say that again",
    "what was the question",
  ];
  const normalizedTranscript = transcript.toLowerCase();
  const shouldRephrase = rephraseKeywords.some((keyword) =>
    normalizedTranscript.includes(keyword)
  );

  if (shouldRephrase) {
    loadingSpinner.classList.remove("hidden");
    assessmentResult.textContent = "";
    statusMessage.textContent = "Rewording the question for you...";

    const rephrasePrompt = `Rephrase the following IELTS speaking question in a simpler way, without changing the core meaning. Do not add any new information. Just provide the rephrased question as a single sentence.
          Original question: "${questionForAssessment}"`;

    try {
      const response = await fetch(ollamaEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ollamaModel,
          messages: [
            {
              role: "user",
              content: rephrasePrompt,
            },
          ],
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      const rephrasedQuestion = data.message.content.trim();

      loadingSpinner.classList.add("hidden");
      transcriptionDisplay.textContent = ""; // Clear the previous transcript
      questionDisplay.textContent = rephrasedQuestion;
      statusMessage.textContent =
        "Here is the question rephrased. Please try again.";

      // Speak the rephrased question
      const utterance = new SpeechSynthesisUtterance(rephrasedQuestion);
      utterance.lang = "en-US";
      utterance.onend = () => {
        updateButtons(false, true, false); // Enable start button again
      };
      synth.speak(utterance);
    } catch (error) {
      console.error("Error fetching from Ollama:", error);
      loadingSpinner.classList.add("hidden");
      showModal(
        "Error connecting to Ollama for rephrasing. Please ensure your Ollama server is running locally and the model 'llama3' is installed."
      );
      updateButtons(true, false, false);
      statusMessage.textContent =
        "Failed to rephrase. Press 'Next Question' to continue.";
    }

    return; // Exit the function to prevent assessment
  }

  // If not asking to rephrase, proceed with normal assessment
  const prompt = `${ieltsPromptGuide}
        
        Now, please assess the following transcript based on the user's answer to the question: "${questionForAssessment}"
        
        User's transcript: "${transcript}"`;

  try {
    const response = await fetch(ollamaEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ollamaModel,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    const assessment = data.message.content;

    loadingSpinner.classList.add("hidden");
    assessmentResult.textContent = assessment;
  } catch (error) {
    console.error("Error fetching from Ollama:", error);
    loadingSpinner.classList.add("hidden");
    showModal(
      "Error connecting to Ollama. Please ensure your Ollama server is running locally and the model 'llama3' is installed."
    );
  } finally {
    // Re-enable the "Next Question" button for the next round
    updateButtons(true, false, false);
    // Check if this was the last question in the topic
    if (currentQuestionIndex >= currentTopic.questions.length) {
      nextQuestionBtn.textContent = "Start New Topic";
      statusMessage.textContent =
        "You've completed this topic! Press 'Start New Topic' for the next one.";
    } else {
      nextQuestionBtn.textContent = "Next Question";
      statusMessage.textContent =
        "Assessment complete. Press 'Next Question' for the next one.";
    }
  }
}

/**
 * Fetches questions from a JSON file and initializes the application.
 */
async function loadQuestionsAndInitialize() {
  try {
    const response = await fetch("./speaking3.json");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    
    // Correctly access the 'topics' array from the JSON object
    if (data && Array.isArray(data.topics)) {
      allTopics = data.topics;
      // Load questions from the master list
      resetTopics();

      // Once loaded, update the display and enable the button
      questionDisplay.textContent =
        "Press 'Next Question' to hear the first question.";
      updateButtons(true, false, false);
      statusMessage.textContent = "Questions loaded successfully. Ready to begin.";
    } else {
      throw new Error("JSON file does not contain a 'topics' array.");
    }
  } catch (error) {
    console.error("Error loading questions:", error);
    questionDisplay.textContent =
      "Error loading questions. Please check the file and try again.";
    showModal(
      "Failed to load questions from speaking3.json. Please ensure the file exists and is accessible."
    );
    // Disable buttons on failure
    updateButtons(false, false, false);
  }
}

// --- Event Listeners ---
nextQuestionBtn.addEventListener("click", () => {
  readQuestion();
});

startBtn.addEventListener("click", () => {
  transcriptionDisplay.textContent = "";
  startListening();
});

stopBtn.addEventListener("click", stopListening);

if (recognition) {
  recognition.onresult = (event) => {
    let finalTranscript = "";
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      }
    }
    transcriptionDisplay.textContent = finalTranscript;
  };

  recognition.onend = () => {
    if (transcriptionDisplay.textContent) {
      sendToOllama(transcriptionDisplay.textContent);
    } else {
      loadingSpinner.classList.add("hidden");
      updateButtons(true, false, false);
      statusMessage.textContent =
        "No speech detected. Press 'Next Question' to continue.";
    }
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
    stopBtn.disabled = true;
    showModal(`Speech recognition error: ${event.error}`);
    updateButtons(true, false, false);
  };
}

// Initial setup
updateButtons(false, false, false);
setupMicrophoneVisualizer();
loadQuestionsAndInitialize();