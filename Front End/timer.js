import { allTasks, updateTask, loadTasks } from './task-management.js'; // Import necessary functions and data from task-management.js
import { showCustomAlert } from './ui-utils.js'; // Import showCustomAlert from ui-utils.js

// --- Timer variables and functions ---
let time = 0; // Current time in seconds (can be float for smooth animation)
let totalTime = 0; // Total time in seconds for the current session (set by user input)
let timerIntervalId = null; // Stores the requestAnimationFrame ID
let isRunning = false;
let timeStartedAt = 0; // performance.now() timestamp when the timer started or resumed
let durationWhenStarted = 0; // The 'time' value when the timer was started or resumed

let linkedTaskId = null; // Stores the ID of the task linked to the timer

const timerCanvas = document.getElementById("timerCanvas");
const timerDisplay = document.getElementById("timerDisplay");
const customTimeInput = document.getElementById("customTimeInput");
const setButton = document.getElementById("setButton");
const startButton = document.getElementById("startButton");
const pauseButton = document.getElementById("pauseButton");
const resetButton = document.getElementById("resetButton");
const timerEndSound = document.getElementById('timerEndSound');
const timerTaskSelect = document.getElementById("timerTaskSelect");

// Canvas context for drawing the progress circle
const ctx = timerCanvas ? timerCanvas.getContext("2d") : null;
const centerX = timerCanvas ? timerCanvas.width / 2 : 0;
const centerY = timerCanvas ? timerCanvas.height / 2 : 0;
const radius = timerCanvas ? timerCanvas.width / 2 - 10 : 0; // Subtract padding for the circle

// Callbacks from main script
let loadTasksCallback = null;
let updateTaskCallback = null;

/**
 * Initializes the timer module.
 * @param {Function} loadTasksFn Callback to load tasks in the main script.
 * @param {Function} updateTaskFn Callback to update a task in the main script.
 */
export function initTimer(loadTasksFn, updateTaskFn) {
    loadTasksCallback = loadTasksFn;
    updateTaskCallback = updateTaskFn;

    // Console log for debugging: Check if canvas and context are available
    console.log("Timer initialized. Canvas element:", timerCanvas, "Canvas context:", ctx);

    if (setButton) setButton.addEventListener("click", setTimer);
    if (startButton) startButton.addEventListener("click", startTimer);
    if (pauseButton) pauseButton.addEventListener("click", pauseTimer);
    if (resetButton) resetButton.addEventListener("click", resetTimer);

    // Presets
    document.getElementById("pomodoroButton")?.addEventListener("click", () => setPreset(25));
    document.getElementById("shortBreakButton")?.addEventListener("click", () => setPreset(5));
    document.getElementById("longBreakButton")?.addEventListener("click", () => setPreset(15));

    if (timerTaskSelect) {
        timerTaskSelect.addEventListener("change", (e) => {
            linkedTaskId = e.target.value === "none" ? null : e.target.value;
            console.log("Timer linked to task:", linkedTaskId);
        });
    }

    // Initial display update
    setTimer(); // Set initial time based on input value and draw the initial state
}

/**
 * Populates the task dropdown for the timer with current tasks.
 * @param {Array<Object>} tasks The array of all tasks.
 */
export function populateTimerTaskSelect(tasks) {
    if (!timerTaskSelect) return;

    const currentSelectedTaskId = timerTaskSelect.value;
    timerTaskSelect.innerHTML = '<option value="none">No Task Linked</option>'; // Reset options

    tasks.forEach(task => {
        const option = document.createElement('option');
        option.value = task.id;
        option.textContent = task.content;
        timerTaskSelect.appendChild(option);
    });

    // Restore previous selection if it still exists
    if (Array.from(timerTaskSelect.options).some(opt => opt.value == currentSelectedTaskId)) { // Use == for loose comparison as task IDs might be numbers/strings
        timerTaskSelect.value = currentSelectedTaskId;
        linkedTaskId = currentSelectedTaskId; // Ensure linkedTaskId is updated
    } else {
        timerTaskSelect.value = 'none';
        linkedTaskId = null;
    }
}

/**
 * Updates the timer display (text and canvas circle).
 */
function updateTimerDisplay() {
    if (!timerDisplay || !ctx || !timerCanvas) {
        // console.warn("Timer display, canvas context, or canvas element not found. Skipping display update.");
        return;
    }

    // Use Math.floor for display to show whole seconds, but 'time' itself can be a float
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    timerDisplay.textContent = `${minutes < 10 ? "0" : ""}${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;

    // Clear canvas for redrawing
    ctx.clearRect(0, 0, timerCanvas.width, timerCanvas.height);

    // Draw background circle (full circle)
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = 'var(--timer-background-color)'; // Use CSS variable for background color
    ctx.lineWidth = 10;
    ctx.stroke();

    // Draw progress arc (represents remaining time, shrinks as time decreases)
    if (totalTime > 0) {
        const startAngle = -Math.PI / 2; // Start from the top (12 o'clock)
        const progressRatio = Math.max(0, time / totalTime); // Ratio of remaining time (0 to 1)
        const endAngle = startAngle + (progressRatio * 2 * Math.PI); // Arc sweeps clockwise for remaining time

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.strokeStyle = 'var(--highlight-color)'; // Use CSS variable for progress color
        ctx.lineWidth = 10;
        ctx.stroke();
    }
    // console.log(`UPDATE: Time: ${time.toFixed(2)}, TotalTime: ${totalTime}, ProgressRatio: ${((time / totalTime) * 100).toFixed(2)}%`); // Debugging log
}

/**
 * Sets the timer to a specified number of minutes.
 * @param {number} minutes The number of minutes to set the timer to.
 */
function setTimer(minutes = parseInt(customTimeInput.value)) {
    if (isNaN(minutes) || minutes <= 0) {
        showCustomAlert("Please enter a valid positive number for minutes.");
        customTimeInput.value = "25"; // Reset to default
        minutes = 25;
    }
    
    time = minutes * 60; // Set initial time in seconds
    totalTime = minutes * 60; // Store total time for progress calculation
    
    // Reset timer state and UI
    cancelAnimationFrame(timerIntervalId); // Ensure any active animation frame is cancelled
    isRunning = false;
    startButton.style.display = 'inline-block';
    pauseButton.style.display = 'none';
    startButton.disabled = false;
    resetButton.disabled = false;
    timerDisplay.classList.remove("active");

    updateTimerDisplay(); // Immediately update display to reflect new time
    console.log(`Timer set to ${minutes} minutes. Time: ${time}, TotalTime: ${totalTime}`);
}

/**
 * Sets a preset timer value.
 * @param {number} minutes The preset minutes.
 */
function setPreset(minutes) {
    customTimeInput.value = minutes;
    setTimer(minutes);
}

/**
 * Starts or resumes the timer.
 */
function startTimer() {
    if (isRunning || time <= 0) {
        if (time <= 0) showCustomAlert("Timer has finished. Please set a new time.");
        return;
    }

    isRunning = true;
    startButton.style.display = 'none';
    pauseButton.style.display = 'inline-block';
    timerDisplay.classList.add("active");

    // Record the exact time when the timer started/resumed and its duration at that moment
    timeStartedAt = performance.now();
    durationWhenStarted = time; // This is the remaining time when 'start' was pressed
    
    // console.log(`Timer started. TimeStartedAt: ${timeStartedAt}, DurationWhenStarted: ${durationWhenStarted}`);

    function animateTimer(currentTime) {
        if (!isRunning) return; // Stop if paused or reset

        const elapsedSinceStart = (currentTime - timeStartedAt) / 1000; // Elapsed time in seconds since start/resume
        
        // Calculate the new remaining time (do NOT floor here for smooth animation)
        time = Math.max(0, durationWhenStarted - elapsedSinceStart);

        updateTimerDisplay(); // Update text and canvas

        if (time <= 0) {
            timerFinished();
            return;
        }
        timerIntervalId = requestAnimationFrame(animateTimer); // Request next frame
    }
    timerIntervalId = requestAnimationFrame(animateTimer); // Start the animation loop
}

/**
 * Pauses the timer.
 */
function pauseTimer() {
    if (!isRunning) return;

    isRunning = false;
    startButton.style.display = 'inline-block';
    pauseButton.style.display = 'none';
    timerDisplay.classList.remove("active");
    cancelAnimationFrame(timerIntervalId); // Stop the animation loop
    // 'time' already holds the current remaining time, no need for a separate 'pausedTime' variable
    console.log(`Timer paused. Remaining time: ${time.toFixed(2)}`);
}

/**
 * Resets the timer to its initial set value.
 */
function resetTimer() {
    pauseTimer(); // Ensure timer is stopped and animation frame cancelled
    setTimer(parseInt(customTimeInput.value)); // Reset to the value in the input field
    startButton.disabled = false;
    resetButton.disabled = false;
    console.log("Timer reset.");
}

/**
 * Handles actions when the timer finishes.
 */
async function timerFinished() {
    pauseTimer(); // Ensure it's fully stopped and animation cancelled

    if (timerEndSound) {
        timerEndSound.play().catch(e => console.error("Error playing timer sound:", e));
    }

    showCustomAlert("Time's up!");
    timerDisplay.textContent = "00:00"; // Ensure it shows 00:00

    // Mark linked task as done if available
    if (linkedTaskId && updateTaskCallback) {
        const taskToUpdate = allTasks.find(task => task.id == linkedTaskId);
        if (taskToUpdate && !taskToUpdate.is_done) {
            await updateTaskCallback(linkedTaskId, { is_done: true });
            showCustomAlert(`Task "${taskToUpdate.content}" marked as completed!`);
            // Reload tasks in main script to update UI
            if (loadTasksCallback) {
                await loadTasksCallback();
            }
        }
    }
    linkedTaskId = null; // Clear linked task after completion
    // populateTimerTaskSelect(allTasks); // This will be called by loadTasks in main.js
}
