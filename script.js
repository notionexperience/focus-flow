import { supabase } from './Front End/supabase-init.js';

let currentUser = null;
const LOCAL_STORAGE_KEY_TASKS = 'focusflow_guest_tasks';
const LOCAL_STORAGE_KEY_NOTES = 'focusflow_guest_notes'; 
const LOCAL_STORAGE_KEY_GOALS = 'focusflow_guest_goals';


const notificationTimers = {};


let allTasks = [];
let allNotes = []; 
let currentNoteId = null; 


const expandedTaskIds = new Set();

let allGoals = [];

// Shared icon markup for edit/delete buttons (replaces old emoji icons so every
// edit/delete button in the app looks the same and is properly centered)
const EDIT_ICON_SVG = `<svg viewBox="0 0 24 24"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>`;
const DELETE_ICON_SVG = `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>`;

function getGuestTasks() {
    try {
        const tasks = localStorage.getItem(LOCAL_STORAGE_KEY_TASKS);
        return tasks ? JSON.parse(tasks) : [];
    } catch (e) {
        console.error("Error parsing guest tasks from localStorage:", e);
        return [];
    }
}

function saveGuestTasks(tasks) {
    localStorage.setItem(LOCAL_STORAGE_KEY_TASKS, JSON.stringify(tasks));
}

function getGuestNotes() {
    try {
        const notes = localStorage.getItem(LOCAL_STORAGE_KEY_NOTES);
        return notes ? JSON.parse(notes) : [];
    } catch (e) {
        console.error("Error parsing guest notes from localStorage:", e);
        return [];
    }
}

function saveGuestNotes(notes) {
    localStorage.setItem(LOCAL_STORAGE_KEY_NOTES, JSON.stringify(notes));
}

function getGuestGoals() {
    try {
        const goals = localStorage.getItem(LOCAL_STORAGE_KEY_GOALS);
        return goals ? JSON.parse(goals) : [];
    } catch (e) {
        console.error("Error parsing guest goals from localStorage:", e);
        return [];
    }
}

function saveGuestGoals(goals) {
    localStorage.setItem(LOCAL_STORAGE_KEY_GOALS, JSON.stringify(goals));
}


async function migrateGuestDataToSupabase() {
    if (!currentUser) {
        console.warn("No user to migrate guest data to.");
        return;
    }

    const guestTasks = getGuestTasks();
    const guestNotes = getGuestNotes();
    const guestGoals = getGuestGoals(); 

    if (guestTasks.length > 0) {
        console.log("Migrating guest tasks to Supabase...");
        const tasksToInsert = guestTasks.map(task => ({
            user_id: currentUser.id,
            content: task.content,
            is_done: task.is_done,
            category: task.category,
            priority: task.priority,
            due_date: task.due_date ? new Date(task.due_date).toISOString() : null,
            position: task.position || 0,
            notification_time: task.notification_time || null,
            subtasks: task.subtasks || [],
            attachments: task.attachments || [], 
            recurrence_type: task.recurrence_type || 'none',
            recurrence_details: task.recurrence_details || {},
            original_task_id: task.original_task_id || null,
            next_occurrence_date: task.next_occurrence_date || null,
            goal_id: task.goal_id || null,
        }));

        const { error: tasksError } = await supabase.from("tasks").insert(tasksToInsert, { ignoreDuplicates: true });
        if (tasksError) {
            console.error("Error migrating guest tasks:", tasksError.message);
        } else {
            console.log("Guest tasks migrated successfully.");
            localStorage.removeItem(LOCAL_STORAGE_KEY_TASKS);
        }
    }

    if (guestNotes.length > 0) {
        console.log("Migrating guest notes to Supabase...");
        const notesToInsert = guestNotes.map(note => ({
            user_id: currentUser.id,
            title: note.title,
            content: note.content,
            category: note.category || 'General',
            created_at: note.created_at || new Date().toISOString(),
            updated_at: note.updated_at || new Date().toISOString(),
        }));

        const { error: notesError } = await supabase.from("notes").upsert(notesToInsert, { onConflict: 'id' });
        if (notesError) {
            console.error("Error migrating guest notes:", notesError.message);
        } else {
            console.log("Guest notes migrated successfully.");
            localStorage.removeItem(LOCAL_STORAGE_KEY_NOTES);
        }
    }

    if (guestGoals.length > 0) {
        console.log("Migrating guest goals to Supabase...");
        const goalsToInsert = guestGoals.map(goal => ({
            user_id: currentUser.id,
            title: goal.title,
            description: goal.description,
            start_date: goal.start_date ? new Date(goal.start_date).toISOString() : null,
            due_date: goal.due_date ? new Date(goal.due_date).toISOString() : null,
            status: goal.status || 'active',
            created_at: goal.created_at || new Date().toISOString(),
            updated_at: goal.updated_at || new Date().toISOString(),
        }));

        const { error: goalsError } = await supabase.from("goals").insert(goalsToInsert, { ignoreDuplicates: true });
        if (goalsError) {
            console.error("Error migrating guest goals:", goalsError.message);
        } else {
            console.log("Guest goals migrated successfully.");
            localStorage.removeItem(LOCAL_STORAGE_KEY_GOALS);
        }
    }
}


// --- Supabase Interaction Functions ---

async function signInUser(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error("Login failed:", error.message);
    showCustomAlert("Login failed: " + error.message);
  } else {
    console.log("Logged in:", data);
    await migrateGuestDataToSupabase();
    await checkUserAndLoadApp();
    requestNotificationPermission();
  }
}

async function signUpUser(email, password) {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) {
    console.error("Signup failed:", error.message);
    showCustomAlert("Signup failed: " + error.message);
  } else {
    showCustomAlert("Signup successful – check your email to confirm");
    await migrateGuestDataToSupabase();
    await checkUserAndLoadApp();
    requestNotificationPermission();
  }
}

async function signOutUser() {
  await supabase.auth.signOut();
  currentUser = null;
  clearAllScheduledNotifications();
  location.reload();
}

async function resetPasswordForEmailUser(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + "/reset.html"
  });

  if (error) {
    showCustomAlert("Error sending password setup email: " + error.message);
  } else {
    showCustomAlert("Check your inbox to set your password.");
  }
}


async function checkUserAndLoadApp() {
  const { data: { user } = {} } = await supabase.auth.getUser();

  const authSection = document.getElementById("auth-section");
  const appSection = document.getElementById("app-section");
  const guestModeMessage = document.getElementById("guestModeMessage");

  const authNavItems = document.getElementById("auth-nav-items");
  const userNavItems = document.getElementById("user-nav-items");
  const userEmailDisplay = document.getElementById("userEmailDisplay");

  if (user) {
    currentUser = user;
    if (authSection) authSection.style.display = "none";
    if (appSection) appSection.style.display = "block";
    if (guestModeMessage) guestModeMessage.style.display = "none";

    if (authNavItems) authNavItems.style.display = "none";
    if (userNavItems) userNavItems.style.display = "flex";
    if (userEmailDisplay) userEmailDisplay.textContent = `Logged in as: ${user.email}`;

    requestNotificationPermission();

  } else {
    currentUser = null;

    if (authNavItems) authNavItems.style.display = "flex";
    if (userNavItems) userNavItems.style.display = "none";
    if (authSection) authSection.style.display = "block";
    if (appSection) appSection.style.display = "block";

    const hasGuestData = getGuestTasks().length > 0 || getGuestNotes().length > 0 || getGuestGoals().length > 0; // Check for guest notes and goals
    if (guestModeMessage) {
        guestModeMessage.style.display = hasGuestData ? "block" : "none";
    }
    if (userEmailDisplay) userEmailDisplay.textContent = "Guest Mode";
  }
  await loadGoals(); // NEW: Load goals before tasks so they can be linked
  await loadTasks();
  await loadNotes(); // NEW: Load multiple notes
  // NEW: Check and generate recurring tasks on app load (works for logged-in
  // users AND guest/local-storage mode)
  await generateRecurringTasks();
}

// --- Data Persistence Functions (Conditional Logic) ---

async function loadTasks() {
    const taskList = document.getElementById("taskList");
    if (!taskList) { console.error("Task list element not found!"); return; }

    let tasks = [];
    if (currentUser) {
        // Fetch tasks, and include subtasks, attachments, recurrence fields, and goal_id
        const { data: supabaseTasks, error } = await supabase
            .from("tasks")
            .select("*, subtasks, attachments, recurrence_type, recurrence_details, original_task_id, next_occurrence_date, goal_id") // NEW: Added goal_id
            .eq("user_id", currentUser.id)
            .order("position", { ascending: true })
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Failed to load tasks from Supabase:", error.message);
            return;
        }
        tasks = supabaseTasks;
        console.log("Loaded tasks from Supabase:", tasks);
    } else {
        tasks = getGuestTasks();
        tasks.sort((a, b) => (a.position || 0) - (b.position || 0) || (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
        console.log("Loaded tasks from Local Storage (Guest Mode):", tasks);
    }
    allTasks = tasks; // Store all tasks in the global variable
    
    // Populate filter dropdowns with unique values from allTasks
    populateCategoryFilter(allTasks);
    populatePriorityFilter(allTasks);
    populateGoalFilter(allGoals); // NEW: Populate goal filter for tasks
    populateTimerTaskSelect(allTasks); // Keep the Pomodoro timer's task-link dropdown in sync

    filterTasks(); // Apply filters and render tasks initially

    updateTaskCounter();
    if (currentUser) {
        scheduleAllTaskNotifications(allTasks);
    }

    // NEW: Reapply expanded state after rendering
    expandedTaskIds.forEach(taskId => {
        const taskElement = document.querySelector(`li[data-task-id="${taskId}"]`);
        if (taskElement) {
            const subtasksContainer = taskElement.querySelector(".subtasks-container");
            const toggleButton = taskElement.querySelector(".toggle-subtasks-button");
            if (subtasksContainer && toggleButton) {
                subtasksContainer.style.display = "block";
                toggleButton.classList.add("expanded");
                toggleButton.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-6">
                        <path fill-rule="evenodd" d="M11.47 7.72a.75.75 0 0 1 1.06 0l7.5 7.5a.75.75 0 1 1-1.06 1.06L12 9.31l-6.97 6.97a.75.75 0 0 1-1.06-1.06l7.5-7.5Z" clip-rule="evenodd" />
                    </svg>
                `;
            }
        }
    });
}

// Modified addTask to accept full ISO date-time string and recurrence info
async function addTask(content, category = "Personal", priority = "Medium", dueDateTime = null, notificationTime = null, attachments = [], recurrenceType = 'none', recurrenceDetails = {}, goalId = null) { // NEW: Added goalId
    let newTask = null;
    const taskList = document.getElementById("taskList");
    const lastTaskPosition = taskList.children.length > 0 ?
        parseInt(taskList.children[taskList.children.length - 1].dataset.position) + 1 : 0;

    // Calculate next_occurrence_date if it's a recurring task
    let nextOccurrenceDate = null;
    if (recurrenceType !== 'none' && dueDateTime) {
        nextOccurrenceDate = calculateNextOccurrence(new Date(dueDateTime), recurrenceType, recurrenceDetails).toISOString();
    }

    if (currentUser) {
        const { data, error } = await supabase.from("tasks").insert([
            {
                user_id: currentUser.id,
                content: content,
                is_done: false,
                category: category,
                priority: priority,
                due_date: dueDateTime, // Store as full ISO string
                position: lastTaskPosition,
                notification_time: notificationTime, // This is expected to be minutes offset
                subtasks: [], // Initialize with an empty array for subtasks (Supabase jsonb)
                attachments: attachments, // Store attachments (Supabase jsonb)
                recurrence_type: recurrenceType, // NEW
                recurrence_details: recurrenceDetails, // NEW
                original_task_id: null, // This is an original recurring task, not an instance
                next_occurrence_date: nextOccurrenceDate, // NEW
                goal_id: goalId, // NEW: Include goal_id
            },
        ]).select();

        if (error) {
            console.error("Add task to Supabase failed:", error.message);
            return null;
        }
        newTask = data[0];
        scheduleTaskNotification(newTask);
    } else {
        const guestTasks = getGuestTasks();
        newTask = {
            id: Date.now(), // Use Date.now() for unique ID in guest mode
            content: content,
            is_done: false,
            category: category,
            priority: priority,
            created_at: new Date().toISOString(),
            due_date: dueDateTime, // Store as full ISO string
            position: lastTaskPosition,
            notification_time: notificationTime, // This is expected to be minutes offset
            subtasks: [], // Initialize with an empty array for subtasks
            attachments: attachments, // Store attachments
            recurrence_type: recurrenceType, // NEW
            recurrence_details: recurrenceDetails, // NEW
            original_task_id: null, // This is an original recurring task, not an instance
            next_occurrence_date: nextOccurrenceDate, // NEW
            goal_id: goalId, // NEW: Include goal_id
        };
        guestTasks.push(newTask);
        saveGuestTasks(guestTasks);
        console.log("Added task to Local Storage (Guest Mode):", newTask);
    }
    return newTask;
}

// New function to update a task
async function updateTask(taskId, updates) {
    if (currentUser) {
        const { error } = await supabase
            .from("tasks")
            .update(updates)
            .eq("id", taskId)
            .eq("user_id", currentUser.id);
        if (error) console.error("Failed to update task in Supabase:", error.message);
    } else {
        let guestTasks = getGuestTasks();
        const taskIndex = guestTasks.findIndex(t => t.id == Number(taskId));
        if (taskIndex !== -1) {
            guestTasks[taskIndex] = { ...guestTasks[taskIndex], ...updates };
            saveGuestTasks(guestTasks);
        }
    }
    // If due_date or notification_time is updated, reschedule notification
    if (updates.due_date !== undefined || updates.notification_time !== undefined) {
        // Fetch the updated task to ensure all fields are current for scheduling
        let currentTask = null;
        if (currentUser) {
            const { data, error } = await supabase.from("tasks").select("*").eq("id", taskId).single();
            if (!error) currentTask = data;
        } else {
            currentTask = allTasks.find(t => t.id == Number(taskId)); // Use allTasks for guest mode
        }

        if (currentTask) {
            scheduleTaskNotification(currentTask);
        }
    }
    if (updates.is_done !== undefined || updates.goal_id !== undefined) {
        await loadGoals();
    }
}


async function deleteTask(id) {
    clearScheduledNotification(id);

    if (currentUser) {
        const taskToDelete = allTasks.find(t => t.id == id);
        if (taskToDelete && taskToDelete.attachments && taskToDelete.attachments.length > 0) {
            const filePaths = taskToDelete.attachments.map(att => att.file_path).filter(Boolean);
            if (filePaths.length > 0) {
                const { error: storageError } = await supabase.storage
                    .from('task-attachments') // Your bucket name
                    .remove(filePaths);
                if (storageError) {
                    console.error("Error deleting associated files from Supabase Storage:", storageError.message);
                }
            }
        }

        const { error } = await supabase
            .from("tasks")
            .delete()
            .eq("id", id)
            .eq("user_id", currentUser.id);

        if (error) console.error("Failed to delete task from Supabase:", error.message);
    } else {
        let guestTasks = getGuestTasks();
        guestTasks = guestTasks.filter(task => task.id !== Number(id));
        saveGuestTasks(guestTasks);
        console.log("Deleted task from Local Storage (Guest Mode):", id);
    }
    await updateTaskPositionsInDB();
    await loadGoals();
}

async function loadNotes() {
    const noteListContainer = document.getElementById("note-list-container");
    if (!noteListContainer) { console.error("Note list container not found!"); return; }

    let notes = [];
    if (currentUser) {
        const { data: supabaseNotes, error } = await supabase
            .from("notes")
            .select("*")
            .eq("user_id", currentUser.id)
            .order("updated_at", { ascending: false });

        if (error) {
            console.error("Failed to load notes from Supabase:", error.message);
            return;
        }
        notes = supabaseNotes;
        console.log("Loaded notes from Supabase:", notes);
    } else {
        notes = getGuestNotes();
        notes.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        console.log("Loaded notes from Local Storage (Guest Mode):", notes);
    }
    allNotes = notes; // Store all notes in the global variable

    populateNoteCategoryFilter(allNotes); // Populate category filter for notes
    filterNotes(); // Filter and render notes initially
    
    if (allNotes.length > 0) {
        if (!currentNoteId || !allNotes.some(note => note.id === currentNoteId)) {
            selectNote(allNotes[0].id);
        } else {
            selectNote(currentNoteId); 
        }
    } else {
        createNote(); 
    }
}

async function saveNote(noteId, title, content, category) {
    if (!noteId) {
        console.error("Cannot save note: noteId is missing.");
        return;
    }

    const updated_at = new Date().toISOString();
    let updates = { title, content, category, updated_at };

    if (currentUser) {
        const { error } = await supabase.from("notes").upsert(
            { id: noteId, user_id: currentUser.id, ...updates },
            { onConflict: 'id' } 
        );
        if (error) console.error("Failed to save note to Supabase:", error.message);
    } else {
        let guestNotes = getGuestNotes();
        const noteIndex = guestNotes.findIndex(n => n.id === noteId);
        if (noteIndex !== -1) {
            guestNotes[noteIndex] = { ...guestNotes[noteIndex], ...updates };
        } else {
            console.warn("Attempted to save non-existent guest note. Creating new one.");
            guestNotes.push({ id: noteId, ...updates, created_at: updated_at });
        }
        saveGuestNotes(guestNotes);
        console.log("Saved note to Local Storage (Guest Mode):", noteId);
    }
    await loadNotes();
    selectNote(noteId); 
}

async function createNote() {
    const newNote = {
        id: crypto.randomUUID(),
        title: "New Note",
        content: "",
        category: "General",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    if (currentUser) {
        const { data, error } = await supabase.from("notes").insert([
            { user_id: currentUser.id, ...newNote }
        ]).select();

        if (error) {
            console.error("Failed to create note in Supabase:", error.message);
            return;
        }
        allNotes.unshift(data[0]); 
    } else {
        allNotes.unshift(newNote); 
        saveGuestNotes(allNotes);
    }
    await loadNotes(); 
    selectNote(newNote.id); 
}

async function deleteNote(noteId) {
    showCustomConfirm("Are you sure you want to delete this note? This cannot be undone.", async () => {
        if (currentUser) {
            const { error } = await supabase
                .from("notes")
                .delete()
                .eq("id", noteId)
                .eq("user_id", currentUser.id);

            if (error) console.error("Failed to delete note from Supabase:", error.message);
        } else {
            allNotes = allNotes.filter(note => note.id !== noteId);
            saveGuestNotes(allNotes);
        }
        currentNoteId = null; 

        await loadNotes(); 
    });
}

function selectNote(noteId) {
    const note = allNotes.find(n => n.id === noteId);
    if (note) {
        currentNoteId = noteId;
        const noteTitleInput = document.getElementById("noteTitleInput");
        const noteCategorySelect = document.getElementById("noteCategorySelect");
        const deleteNoteButton = document.getElementById("deleteNoteButton");

        noteTitleInput.value = note.title;
        ensureOptionExists(noteCategorySelect, note.category);
        noteCategorySelect.value = note.category || "General";
        
        if (quill) {
            quill.root.innerHTML = note.content;
            quill.focus(); // Focus the editor
        }

        document.querySelectorAll('.note-list-item').forEach(item => {
            item.classList.remove('selected');
        });
        const selectedItem = document.querySelector(`.note-list-item[data-note-id="${noteId}"]`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }

        deleteNoteButton.disabled = false;
    } else {
        currentNoteId = null;
        document.getElementById("noteTitleInput").value = "";
        document.getElementById("noteCategorySelect").value = "General";
        if (quill) quill.root.innerHTML = "";
        document.getElementById("deleteNoteButton").disabled = true;
        document.querySelectorAll('.note-list-item').forEach(item => item.classList.remove('selected'));
    }
}

function renderNoteList(notesToRender = allNotes) {
    const noteListContainer = document.getElementById("note-list-container");
    const ul = document.createElement("ul");

    if (notesToRender.length === 0) {
        noteListContainer.innerHTML = '<p class="empty-state">No notes found. Click "New Note" to create one!</p>';
        document.getElementById("deleteNoteButton").disabled = true;
        document.getElementById("noteTitleInput").value = "";
        document.getElementById("noteCategorySelect").value = "General";
        if (quill) quill.root.innerHTML = "";
        return;
    }

    notesToRender.forEach(note => {
        const li = document.createElement("li");
        li.classList.add("note-list-item");
        li.dataset.noteId = note.id;
        if (note.id === currentNoteId) {
            li.classList.add("selected");
        }

        const titleSpan = document.createElement("span");
        titleSpan.classList.add("note-list-item-title");
        titleSpan.textContent = note.title || "Untitled Note";
        li.appendChild(titleSpan);

        const dateSpan = document.createElement("span");
        dateSpan.classList.add("note-list-item-date");
        dateSpan.textContent = new Date(note.updated_at).toLocaleDateString();
        li.appendChild(dateSpan);

        li.addEventListener("click", () => selectNote(note.id));
        ul.appendChild(li);
    });
    noteListContainer.innerHTML = ''; // Clear previous list
    noteListContainer.appendChild(ul);
}

async function loadGoals() {
    const goalList = document.getElementById("goalList");
    const noGoalsMessage = document.getElementById("noGoalsMessage");
    if (!goalList || !noGoalsMessage) { console.error("Goal elements not found!"); return; }

    let goals = [];
    if (currentUser) {
        const { data: supabaseGoals, error } = await supabase
            .from("goals")
            .select("*")
            .eq("user_id", currentUser.id)
            .order("due_date", { ascending: true })
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Failed to load goals from Supabase:", error.message);
            return;
        }
        goals = supabaseGoals;
        console.log("Loaded goals from Supabase:", goals);
    } else {
        goals = getGuestGoals();
        goals.sort((a, b) => {
            const dateA = a.due_date ? new Date(a.due_date).getTime() : Infinity;
            const dateB = b.due_date ? new Date(b.due_date).getTime() : Infinity;
            return dateA - dateB || (new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        });
        console.log("Loaded goals from Local Storage (Guest Mode):", goals);
    }
    allGoals = goals; 
    populateGoalSelect(allGoals);
    populateGoalFilter(allGoals);
    filterGoals();
}

async function addGoal(title, description, startDate, dueDate, status) {
    let newGoal = null;
    if (currentUser) {
        const { data, error } = await supabase.from("goals").insert([
            {
                user_id: currentUser.id,
                title: title,
                description: description,
                start_date: startDate,
                due_date: dueDate,
                status: status,
            },
        ]).select();

        if (error) {
            console.error("Add goal to Supabase failed:", error.message);
            return null;
        }
        newGoal = data[0];
    } else {
        const guestGoals = getGuestGoals();
        newGoal = {
            id: crypto.randomUUID(),
            title: title,
            description: description,
            start_date: startDate,
            due_date: dueDate,
            status: status,
            position: guestGoals.length,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        guestGoals.push(newGoal);
        saveGuestGoals(guestGoals);
        console.log("Added goal to Local Storage (Guest Mode):", newGoal);
    }
    await loadGoals(); 
    return newGoal;
}

async function updateGoal(goalId, updates) {
    if (currentUser) {
        const { error } = await supabase
            .from("goals")
            .update(updates)
            .eq("id", goalId)
            .eq("user_id", currentUser.id);
        if (error) console.error("Failed to update goal in Supabase:", error.message);
    } else {
        let guestGoals = getGuestGoals();
        const goalIndex = guestGoals.findIndex(g => g.id === goalId);
        if (goalIndex !== -1) {
            guestGoals[goalIndex] = { ...guestGoals[goalIndex], ...updates };
            saveGuestGoals(guestGoals);
        }
    }
    await loadGoals(); 
}

async function deleteGoal(goalId) {
    showCustomConfirm("Are you sure you want to delete this goal? All linked tasks will be unlinked.", async () => {
        const tasksToUnlink = allTasks.filter(task => task.goal_id === goalId);
        for (const task of tasksToUnlink) {
            await updateTask(task.id, { goal_id: null });
        }

        if (currentUser) {
            const { error } = await supabase
                .from("goals")
                .delete()
                .eq("id", goalId)
                .eq("user_id", currentUser.id);

            if (error) console.error("Failed to delete goal from Supabase:", error.message);
        } else {
            allGoals = allGoals.filter(goal => goal.id !== goalId);
            saveGuestGoals(allGoals);
        }
        await loadGoals(); 
        await loadTasks(); 
    });
}

function calculateGoalProgress(goalId) {
    const linkedTasks = allTasks.filter(task => task.goal_id === goalId);
    if (linkedTasks.length === 0) {
        return { completed: 0, total: 0, percentage: 0 };
    }
    const completedTasks = linkedTasks.filter(task => task.is_done).length;
    const percentage = (completedTasks / linkedTasks.length) * 100;
    return { completed: completedTasks, total: linkedTasks.length, percentage: percentage };
}

const GOAL_LINKED_TASKS_PREVIEW_COUNT = 3;

function createGoalElement(goal) {
    const li = document.createElement("li");
    li.classList.add("goal-item");
    li.dataset.goalId = goal.id;
    li.dataset.status = goal.status;
    li.dataset.position = goal.position ?? 0;
    li.draggable = false; // toggled true only while the drag handle is pressed

    const header = document.createElement("div");
    header.classList.add("goal-item-header");
    li.appendChild(header);

    // NEW: Drag handle — grabbing this (rather than the whole card) reorders the
    // goal, so it doesn't fight with clicking the status select or the quick-add
    // input inside the card.
    const dragHandle = document.createElement("span");
    dragHandle.classList.add("goal-drag-handle");
    dragHandle.setAttribute("aria-hidden", "true");
    dragHandle.title = "Drag to reorder";
    dragHandle.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="6" r="1.6"></circle><circle cx="8" cy="12" r="1.6"></circle><circle cx="8" cy="18" r="1.6"></circle><circle cx="16" cy="6" r="1.6"></circle><circle cx="16" cy="12" r="1.6"></circle><circle cx="16" cy="18" r="1.6"></circle></svg>`;
    header.appendChild(dragHandle);

    const titleDisplay = document.createElement("span");
    titleDisplay.classList.add("goal-title-display");
    titleDisplay.textContent = goal.title;
    titleDisplay.title = goal.title;
    header.appendChild(titleDisplay);

    const datesDisplay = document.createElement("span");
    datesDisplay.classList.add("goal-dates-display");
    const startDate = goal.start_date ? new Date(goal.start_date).toLocaleDateString() : 'N/A';
    const dueDate = goal.due_date ? new Date(goal.due_date).toLocaleDateString() : 'N/A';
    datesDisplay.textContent = `📅 ${startDate} - ${dueDate}`;
    header.appendChild(datesDisplay);

    if (goal.description) {
        const descriptionDisplay = document.createElement("p");
        descriptionDisplay.classList.add("goal-description-display");
        descriptionDisplay.textContent = goal.description;
        descriptionDisplay.title = goal.description;
        li.appendChild(descriptionDisplay);
    }

    // Progress Bar - compact, single row (bar + % text) instead of a full-width bar
    // followed by a separate text line.
    const progressData = calculateGoalProgress(goal.id);
    const progressRow = document.createElement("div");
    progressRow.classList.add("goal-progress-row");
    li.appendChild(progressRow);

    const progressContainer = document.createElement("div");
    progressContainer.classList.add("goal-progress-container");
    progressRow.appendChild(progressContainer);

    const progressBar = document.createElement("div");
    progressBar.classList.add("goal-progress-bar");
    progressBar.style.width = `${progressData.percentage}%`;
    progressContainer.appendChild(progressBar);

    const progressText = document.createElement("span");
    progressText.classList.add("goal-progress-text");
    progressText.textContent = `${progressData.completed}/${progressData.total} (${progressData.percentage.toFixed(0)}%)`;
    progressRow.appendChild(progressText);

    // List the actual tasks linked to this goal, capped to a short preview with a
    // "show more" toggle so the card doesn't grow unbounded.
    const linkedTasks = allTasks.filter(task => task.goal_id === goal.id);
    if (linkedTasks.length > 0) {
        const linkedTasksList = document.createElement("ul");
        linkedTasksList.classList.add("goal-linked-tasks");

        const renderTaskItem = (task) => {
            const taskItem = document.createElement("li");
            taskItem.classList.add("goal-linked-task-item");
            if (task.is_done) taskItem.classList.add("done");

            const checkMark = document.createElement("span");
            checkMark.classList.add("goal-linked-task-check");
            checkMark.textContent = task.is_done ? "✔" : "○";
            taskItem.appendChild(checkMark);

            const taskLabel = document.createElement("span");
            taskLabel.classList.add("goal-linked-task-label");
            taskLabel.textContent = task.content;
            taskItem.appendChild(taskLabel);

            taskItem.title = task.content;
            taskItem.addEventListener("click", () => {
                const goalFilter = document.getElementById("goalFilter");
                const toggleGoalsBtn = document.getElementById("toggleGoals");
                const goalsSection = document.getElementById("goalsSection");
                if (goalFilter) {
                    goalFilter.value = goal.id;
                    filterTasks();
                }
                // Switch back to the task list view so the filtered task is visible
                if (goalsSection && goalsSection.style.display !== "none") {
                    if (toggleGoalsBtn) toggleGoalsBtn.click();
                }
            });

            return taskItem;
        };

        linkedTasks.slice(0, GOAL_LINKED_TASKS_PREVIEW_COUNT).forEach(task => {
            linkedTasksList.appendChild(renderTaskItem(task));
        });

        const remaining = linkedTasks.length - GOAL_LINKED_TASKS_PREVIEW_COUNT;
        if (remaining > 0) {
            const showMoreBtn = document.createElement("button");
            showMoreBtn.type = "button";
            showMoreBtn.classList.add("goal-show-more-tasks");
            showMoreBtn.textContent = `+ ${remaining} more task${remaining > 1 ? "s" : ""}`;
            showMoreBtn.addEventListener("click", () => {
                showMoreBtn.remove();
                linkedTasks.slice(GOAL_LINKED_TASKS_PREVIEW_COUNT).forEach(task => {
                    linkedTasksList.appendChild(renderTaskItem(task));
                });
            });
            linkedTasksList.appendChild(showMoreBtn);
        }

        li.appendChild(linkedTasksList);
    }

    // Quick-add: create a task pre-linked to this goal without leaving the card.
    const addTaskForm = document.createElement("div");
    addTaskForm.classList.add("goal-add-task-form");

    const addTaskInput = document.createElement("input");
    addTaskInput.type = "text";
    addTaskInput.classList.add("input", "goal-add-task-input");
    addTaskInput.placeholder = "+ Add task to this goal…";
    addTaskInput.setAttribute("aria-label", `Add task to ${goal.title}`);
    addTaskForm.appendChild(addTaskInput);

    const addTaskBtn = document.createElement("button");
    addTaskBtn.type = "button";
    addTaskBtn.classList.add("button", "goal-add-task-button");
    addTaskBtn.textContent = "Add";
    addTaskForm.appendChild(addTaskBtn);

    const submitGoalTask = async () => {
        const text = addTaskInput.value.trim();
        if (!text) return;
        addTaskBtn.disabled = true;
        const newTask = await addTask(text, "Personal", "Medium", null, null, [], 'none', {}, goal.id);
        addTaskBtn.disabled = false;
        if (newTask) {
            addTaskInput.value = "";
            await loadTasks();
            await loadGoals();
        }
    };
    addTaskBtn.addEventListener("click", submitGoalTask);
    addTaskInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            submitGoalTask();
        }
    });

    li.appendChild(addTaskForm);

    // NEW: Footer — status, edit and delete are now grouped together in one row
    // instead of status living in the header and edit/delete floating separately.
    const footer = document.createElement("div");
    footer.classList.add("goal-footer");
    li.appendChild(footer);

    // Status is editable directly on the card (no need to open the edit modal
    // just to mark a goal completed/archived).
    const statusSelect = document.createElement("select");
    statusSelect.classList.add("goal-status-select", goal.status);
    statusSelect.setAttribute("aria-label", `Status for ${goal.title}`);
    ["active", "completed", "archived"].forEach(statusValue => {
        const option = document.createElement("option");
        option.value = statusValue;
        option.textContent = statusValue.charAt(0).toUpperCase() + statusValue.slice(1);
        if (statusValue === goal.status) option.selected = true;
        statusSelect.appendChild(option);
    });
    statusSelect.addEventListener("click", (e) => e.stopPropagation());
    statusSelect.addEventListener("change", async (e) => {
        const newStatus = e.target.value;
        statusSelect.classList.remove("active", "completed", "archived");
        statusSelect.classList.add(newStatus);
        await updateGoal(goal.id, { status: newStatus });
    });
    footer.appendChild(statusSelect);

    const actionsDiv = document.createElement("div");
    actionsDiv.classList.add("goal-actions");
    footer.appendChild(actionsDiv);

    const editBtn = document.createElement("button");
    editBtn.classList.add("edit-button");
    editBtn.innerHTML = EDIT_ICON_SVG;
    editBtn.title = "Edit goal";
    editBtn.setAttribute('aria-label', 'Edit goal');
    editBtn.addEventListener("click", () => showGoalModal(goal));
    actionsDiv.appendChild(editBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.classList.add("delete-button");
    deleteBtn.innerHTML = DELETE_ICON_SVG;
    deleteBtn.title = "Delete goal";
    deleteBtn.setAttribute('aria-label', 'Delete goal');
    deleteBtn.addEventListener("click", () => deleteGoal(goal.id));
    actionsDiv.appendChild(deleteBtn);

    // NEW: Drag-and-drop reordering, initiated only from the drag handle.
    const startDrag = () => { li.draggable = true; };
    const stopDragFlag = () => { li.draggable = false; };
    dragHandle.addEventListener("mousedown", startDrag);
    dragHandle.addEventListener("touchstart", startDrag, { passive: true });
    dragHandle.addEventListener("mouseup", stopDragFlag);

    li.addEventListener("dragstart", e => {
        li.classList.add("dragging");
        draggedGoalItem = li;
        try {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", String(goal.id));
        } catch (err) { /* some browsers restrict dataTransfer access; safe to ignore */ }
    });

    li.addEventListener("dragend", () => {
        li.draggable = false;
        li.classList.remove("dragging");
        document.querySelectorAll("#goalList .goal-item").forEach(item => {
            item.classList.remove("dragover-top", "dragover-bottom");
        });
        draggedGoalItem = null;
        updateGoalPositionsInDB();
    });

    return li;
}

function renderGoals(goalsToRender) {
    const goalList = document.getElementById("goalList");
    const noGoalsMessage = document.getElementById("noGoalsMessage");
    if (!goalList || !noGoalsMessage) return;

    goalList.innerHTML = "";
    if (goalsToRender.length === 0) {
        noGoalsMessage.style.display = 'block';
    } else {
        noGoalsMessage.style.display = 'none';
        goalsToRender.forEach(goal => {
            const li = createGoalElement(goal);
            goalList.appendChild(li);
        });
    }
    initGoalListDragAndDrop();
}

// NEW: Drag-and-drop reordering for goal cards.
// The goal list renders as a CSS grid (cards can sit side-by-side), so instead of
// just comparing against the single card under the cursor (which works fine for a
// simple vertical list like #taskList), we find whichever card's center is
// geometrically closest to the cursor and insert before/after that one.
let draggedGoalItem = null;

function getGoalDropTarget(container, x, y) {
    const items = [...container.querySelectorAll(".goal-item:not(.dragging)")];
    let closest = null;
    let closestDistance = Infinity;

    items.forEach(item => {
        const box = item.getBoundingClientRect();
        const centerX = box.left + box.width / 2;
        const centerY = box.top + box.height / 2;
        const distance = Math.hypot(x - centerX, y - centerY);
        if (distance < closestDistance) {
            closestDistance = distance;
            closest = { item, box };
        }
    });

    if (!closest) return { element: null, insertBefore: true };
    const insertBefore = y < closest.box.top + closest.box.height / 2;
    return { element: closest.item, insertBefore };
}

function initGoalListDragAndDrop() {
    const goalList = document.getElementById("goalList");
    if (!goalList || goalList.dataset.dndInit === "true") return;
    goalList.dataset.dndInit = "true";

    goalList.addEventListener("dragover", e => {
        if (!draggedGoalItem) return;
        e.preventDefault();

        goalList.querySelectorAll(".goal-item").forEach(item => {
            item.classList.remove("dragover-top", "dragover-bottom");
        });

        const { element, insertBefore } = getGoalDropTarget(goalList, e.clientX, e.clientY);
        if (element) {
            element.classList.add(insertBefore ? "dragover-top" : "dragover-bottom");
        }
    });

    goalList.addEventListener("drop", e => {
        if (!draggedGoalItem) return;
        e.preventDefault();

        goalList.querySelectorAll(".goal-item").forEach(item => {
            item.classList.remove("dragover-top", "dragover-bottom");
        });

        const { element, insertBefore } = getGoalDropTarget(goalList, e.clientX, e.clientY);
        if (element && element !== draggedGoalItem) {
            if (insertBefore) {
                goalList.insertBefore(draggedGoalItem, element);
            } else {
                goalList.insertBefore(draggedGoalItem, element.nextSibling);
            }
        } else if (!element) {
            goalList.appendChild(draggedGoalItem);
        }
    });
}

async function updateGoalPositionsInDB() {
    const goalList = document.getElementById("goalList");
    if (!goalList) return;

    const goalsInOrder = Array.from(goalList.children)
        .filter(li => li.classList.contains("goal-item"))
        .map((li, index) => ({ id: li.dataset.goalId, position: index }));

    if (goalsInOrder.length === 0) return;

    // Keep the manual order sticky so it isn't immediately overwritten by the
    // default due-date/created-date sort the next time the list re-renders.
    const goalSortOrderSelect = document.getElementById("goalSortOrder");
    if (goalSortOrderSelect && Array.from(goalSortOrderSelect.options).some(o => o.value === "custom")) {
        goalSortOrderSelect.value = "custom";
    }

    goalsInOrder.forEach(({ id, position }) => {
        const goal = allGoals.find(g => String(g.id) === String(id));
        if (goal) goal.position = position;
    });

    if (currentUser) {
        for (const { id, position } of goalsInOrder) {
            const { error } = await supabase
                .from("goals")
                .update({ position })
                .eq("id", id)
                .eq("user_id", currentUser.id);
            if (error) {
                // If the `goals` table doesn't have a `position` column yet, this
                // will fail — reordering still works for the current session, it
                // just won't survive a reload until that column is added.
                console.error(`Failed to update position for goal ${id} in Supabase:`, error.message);
                break;
            }
        }
    } else {
        let guestGoals = getGuestGoals();
        goalsInOrder.forEach(({ id, position }) => {
            const idx = guestGoals.findIndex(g => String(g.id) === String(id));
            if (idx !== -1) guestGoals[idx].position = position;
        });
        saveGuestGoals(guestGoals);
    }
}

// NEW: Truncate long goal titles so they don't blow out native <select> dropdowns;
// the full title is still available via the option's title tooltip.
function truncateForOption(text, maxLength = 42) {
    if (!text) return "";
    return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

function populateGoalSelect(goals) {
    const goalSelect = document.getElementById("goalSelect");
    const editGoalSelect = document.getElementById("editGoalSelect");
    if (!goalSelect || !editGoalSelect) return;

    const currentGoalSelectValue = goalSelect.value;
    const currentEditGoalSelectValue = editGoalSelect.value;

    goalSelect.innerHTML = '<option value="none">No Goal</option>';
    editGoalSelect.innerHTML = '<option value="none">No Goal</option>';

    goals.forEach(goal => {
        const option = document.createElement('option');
        option.value = goal.id;
        option.textContent = truncateForOption(goal.title);
        option.title = goal.title;
        goalSelect.appendChild(option);

        const editOption = document.createElement('option');
        editOption.value = goal.id;
        editOption.textContent = truncateForOption(goal.title);
        editOption.title = goal.title;
        editGoalSelect.appendChild(editOption);
    });

    if (Array.from(goalSelect.options).some(opt => opt.value === currentGoalSelectValue)) {
        goalSelect.value = currentGoalSelectValue;
    } else {
        goalSelect.value = 'none';
    }
    if (Array.from(editGoalSelect.options).some(opt => opt.value === currentEditGoalSelectValue)) {
        editGoalSelect.value = currentEditGoalSelectValue;
    } else {
        editGoalSelect.value = 'none';
    }
}

function populateGoalFilter(goals) {
    const goalFilter = document.getElementById("goalFilter");
    if (!goalFilter) return;

    const currentGoalFilterValue = goalFilter.value;

    goalFilter.innerHTML = '<option value="all">All Goals</option><option value="no-goal">No Goal</option>';
    goals.forEach(goal => {
        const option = document.createElement('option');
        option.value = goal.id;
        option.textContent = truncateForOption(goal.title);
        option.title = goal.title;
        goalFilter.appendChild(option);
    });

    if (Array.from(goalFilter.options).some(opt => opt.value === currentGoalFilterValue)) {
        goalFilter.value = currentGoalFilterValue;
    } else {
        goalFilter.value = 'all';
    }
}


function renderTasks(tasksToRender) {
  const taskList = document.getElementById("taskList");
  if (!taskList) {
    console.error("Task list element not found!");
    return;
  }
  taskList.innerHTML = "";
  tasksToRender.forEach(task => {
    const li = createTaskElement(task);
    taskList.appendChild(li);
  });
}

async function updateTaskPositionsInDB() {
    const taskList = document.getElementById("taskList");
    if (!taskList) return;

    const tasksInOrder = Array.from(taskList.children).map((li, index) => {
        return {
            id: Number(li.dataset.taskId),
            position: index,
        };
    });

if (currentUser) {
    for (const task of tasksInOrder) {
        const { error } = await supabase
            .from("tasks")
            .update({ position: task.position })
            .eq("id", task.id)
            .eq("user_id", currentUser.id);
        if (error) {
            console.error(`Failed to update position for task ${task.id} in Supabase:`, error.message);
        }
    }
        console.log("Task positions updated in Supabase.");
    } else {
        let guestTasks = getGuestTasks();
        tasksInOrder.forEach(updatedTask => {
            const taskIndex = guestTasks.findIndex(t => t.id === updatedTask.id);
            if (taskIndex !== -1) {
                guestTasks[taskIndex].position = updatedTask.position;
            }
        });
        saveGuestTasks(guestTasks);
        console.log("Task positions updated in Local Storage (Guest Mode).");
    }
}

function updateTaskCounter() {
  const taskList = document.getElementById("taskList");
  if (!taskList) return;
  const totalTasks = taskList.children.length;
  const finishedTasks = taskList.querySelectorAll("li.finished").length;

  const counterSpan = document.querySelector("#taskCountToday .count");

  if (counterSpan) {
    counterSpan.textContent = ` Tasks: ${finishedTasks} / ${totalTasks} completed`;
  }
}
const themeToggleBtn = document.getElementById("themeToggle");
const storedTheme = localStorage.getItem("theme");

if (storedTheme) {
    document.body.setAttribute("data-theme", storedTheme);
    if (themeToggleBtn) {
        themeToggleBtn.setAttribute("aria-pressed", storedTheme === "dark");
    }
}

if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
        const currentTheme = document.body.getAttribute("data-theme");
        const newTheme = currentTheme === "dark" ? "light" : "dark";
        document.body.setAttribute("data-theme", newTheme);
        localStorage.setItem("theme", newTheme);
        themeToggleBtn.setAttribute("aria-pressed", newTheme === "dark");
    });
}

// --- Pomodoro Timer (compact circular timer, pausable, presets, task-linked) ---
const POMODORO_PRESETS = { pomodoro: { minutes: 25, label: "Focus Session" }, short: { minutes: 5, label: "Short Break" }, long: { minutes: 15, label: "Long Break" } };
const POMODORO_RING_RADIUS = 88;
const POMODORO_RING_CIRCUMFERENCE = 2 * Math.PI * POMODORO_RING_RADIUS;

let time = 0; // remaining seconds (can be fractional while running, for a smooth ring)
let totalTime = 0; // seconds the current session started with
let timerAnimationId = null;
let isTimerRunning = false;
let timerStartedAt = 0; // performance.now() when started/resumed
let timerDurationWhenStarted = 0;
let currentTimerMode = "pomodoro";
let linkedTimerTaskId = null;

const timerElement = document.getElementById("timer");
const timeInput = document.getElementById("timeInput");
const setButton = document.getElementById("setButton");
const startButton = document.getElementById("startButton");
const pauseButton = document.getElementById("pauseButton");
const stopButton = document.getElementById("stopButton"); // acts as "Reset"
const timerSessionLabel = document.getElementById("timerSessionLabel");
const timerRingProgress = document.getElementById("timerRingProgress");
const timerTaskSelect = document.getElementById("timerTaskSelect");
const timerModeButtons = document.querySelectorAll(".mode-button");

const timerEndSound = document.getElementById('timerEndSound');

if (timerRingProgress) {
    timerRingProgress.style.strokeDasharray = `${POMODORO_RING_CIRCUMFERENCE}`;
    timerRingProgress.style.strokeDashoffset = "0";
}

function requestNotificationPermission() {
    if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                console.log("Notification permission granted.");
            } else if (permission === "denied") {
                console.warn("Notification permission denied. Please enable notifications for this site in your browser settings if you want them.");
                showCustomAlert("Notification permission denied. Please enable notifications for this site in your browser settings if you want them.");
            }
        }).catch(error => {
            console.error("Error requesting notification permission:", error);
        });
    } else if (!("Notification" in window)) {
        console.warn("Browser does not support desktop notifications.");
    }
}

function updateTimerDisplay() {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    if (timerElement) timerElement.textContent = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;

    if (timerRingProgress && totalTime > 0) {
        const progressRatio = Math.max(0, Math.min(1, time / totalTime));
        timerRingProgress.style.strokeDashoffset = `${POMODORO_RING_CIRCUMFERENCE * (1 - progressRatio)}`;
    }
}

function setTimer(minutes = parseInt(timeInput.value)) {
    if (isNaN(minutes) || minutes <= 0) {
        showCustomAlert("Please enter a valid positive number for minutes.");
        minutes = POMODORO_PRESETS[currentTimerMode].minutes;
        if (timeInput) timeInput.value = minutes;
    }

    time = minutes * 60;
    totalTime = minutes * 60;

    cancelAnimationFrame(timerAnimationId);
    isTimerRunning = false;
    if (startButton) startButton.style.display = "inline-block";
    if (pauseButton) pauseButton.style.display = "none";
    if (timerElement) timerElement.classList.remove("active");

    updateTimerDisplay();
}

function setTimerMode(mode) {
    if (!POMODORO_PRESETS[mode]) return;
    currentTimerMode = mode;
    timerModeButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.mode === mode));
    if (timerSessionLabel) timerSessionLabel.textContent = POMODORO_PRESETS[mode].label;
    if (timeInput) timeInput.value = POMODORO_PRESETS[mode].minutes;

    // Linking a task only makes sense for a Focus session — a break finishing
    // shouldn't be able to mark anything as done.
    const timerTaskLinkField = document.querySelector(".timer-task-link");
    if (timerTaskLinkField) timerTaskLinkField.style.display = mode === "pomodoro" ? "" : "none";
    if (mode !== "pomodoro") {
        linkedTimerTaskId = null;
        if (timerTaskSelect) timerTaskSelect.value = "none";
    }

    setTimer(POMODORO_PRESETS[mode].minutes);
}

function startTimer() {
    if (isTimerRunning || time <= 0) {
        if (time <= 0) showCustomAlert("Timer has finished. Please set a new time.");
        return;
    }

    isTimerRunning = true;
    if (startButton) startButton.style.display = "none";
    if (pauseButton) pauseButton.style.display = "inline-block";
    if (timerElement) timerElement.classList.add("active");

    timerStartedAt = performance.now();
    timerDurationWhenStarted = time;

    function animateTimer(now) {
        if (!isTimerRunning) return;
        const elapsed = (now - timerStartedAt) / 1000;
        time = Math.max(0, timerDurationWhenStarted - elapsed);
        updateTimerDisplay();

        if (time <= 0) {
            timerFinished();
            return;
        }
        timerAnimationId = requestAnimationFrame(animateTimer);
    }
    timerAnimationId = requestAnimationFrame(animateTimer);
}

function pauseTimer() {
    if (!isTimerRunning) return;
    isTimerRunning = false;
    if (startButton) startButton.style.display = "inline-block";
    if (pauseButton) pauseButton.style.display = "none";
    if (timerElement) timerElement.classList.remove("active");
    cancelAnimationFrame(timerAnimationId);
}

function stopTimer() {
    // "Reset" button: stop and restore the timer to the currently set minutes.
    pauseTimer();
    setTimer(parseInt(timeInput.value));
}

async function timerFinished() {
    pauseTimer();

    if (timerEndSound) {
        timerEndSound.play().catch(e => console.error("Error playing sound:", e));
    }

    if ("Notification" in window && Notification.permission === "granted") {
        new Notification("FocusFlow Timer", {
            body: `Your ${POMODORO_PRESETS[currentTimerMode].label.toLowerCase()} has finished!`,
            icon: "./assets/logo.png"
        });
    } else {
        showCustomAlert("Time's up!");
    }

    if (timerElement) timerElement.textContent = "00:00";

    // Only a finished Focus session can complete a linked task — breaks never do.
    if (currentTimerMode === "pomodoro" && linkedTimerTaskId) {
        const taskToUpdate = allTasks.find(task => task.id == linkedTimerTaskId);
        if (taskToUpdate && !taskToUpdate.is_done) {
            await updateTask(linkedTimerTaskId, { is_done: true });
            showCustomAlert(`Task "${taskToUpdate.content}" marked as completed!`);
            await loadTasks();
        }
        linkedTimerTaskId = null;
        if (timerTaskSelect) timerTaskSelect.value = "none";
    }
}

function populateTimerTaskSelect(tasks) {
    if (!timerTaskSelect) return;
    const currentValue = timerTaskSelect.value;
    timerTaskSelect.innerHTML = '<option value="none">🔗 No task linked</option>';
    tasks.filter(t => !t.is_done).forEach(task => {
        const option = document.createElement("option");
        option.value = task.id;
        option.textContent = task.content;
        timerTaskSelect.appendChild(option);
    });
    if (Array.from(timerTaskSelect.options).some(opt => opt.value == currentValue)) {
        timerTaskSelect.value = currentValue;
        linkedTimerTaskId = currentValue === "none" ? null : currentValue;
    } else {
        timerTaskSelect.value = "none";
        linkedTimerTaskId = null;
    }
}

if (timerTaskSelect) {
    timerTaskSelect.addEventListener("change", (e) => {
        linkedTimerTaskId = e.target.value === "none" ? null : e.target.value;
    });
}

timerModeButtons.forEach(btn => {
    btn.addEventListener("click", () => setTimerMode(btn.dataset.mode));
});

function getTodayDateString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function scheduleTaskNotification(task) {
    if (!task.due_date || task.is_done) {
        clearScheduledNotification(task.id);
        return;
    }

    clearScheduledNotification(task.id); 

    const dueDateTime = new Date(task.due_date);

    if (isNaN(dueDateTime.getTime())) {
        console.warn(`Invalid due_date for task ${task.id}: ${task.due_date}. Cannot schedule notification.`);
        return;
    }

    const notificationTimeOffset = task.notification_time !== null ? parseInt(task.notification_time, 10) : 15;

    const notificationTimestamp = dueDateTime.getTime() - (notificationTimeOffset * 60 * 1000);

    const now = Date.now();
    const timeUntilNotification = notificationTimestamp - now;

    if (timeUntilNotification > 0) {
        console.log(`Scheduling in-app notification for task "${task.content}" in ${timeUntilNotification / 1000 / 60} minutes.`);
        const timeoutId = setTimeout(() => {
            const formattedDueTime = new Date(task.due_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const notificationMessage = `${task.content} at ${formattedDueTime}`;

            showCustomAlert(`🔔 ${notificationMessage}`);

            try {
                const notificationSound = new Audio('./notification-sound-effect-372475.mp3');
                notificationSound.play().catch(e => console.error("Error playing notification sound:", e));
            } catch (e) {
                console.error("Could not create Audio object for notification sound:", e);
            }
            
            delete notificationTimers[task.id];
        }, timeUntilNotification);
        notificationTimers[task.id] = timeoutId;
    } else {
        console.log(`In-app notification for task "${task.content}" is in the past or too soon to schedule.`);
    }
}

function scheduleAllTaskNotifications(tasks) {
    clearAllScheduledNotifications();
    tasks.forEach(task => scheduleTaskNotification(task));
}

function clearScheduledNotification(taskId) {
    if (notificationTimers[taskId]) {
        clearTimeout(notificationTimers[taskId]);
        console.log(`Cleared scheduled notification for task ID: ${taskId}`);
        delete notificationTimers[taskId];
    }
}

function clearAllScheduledNotifications() {
    for (const taskId in notificationTimers) {
        clearTimeout(notificationTimers[taskId]);
    }
    console.log("Cleared all scheduled notifications.");
    Object.keys(notificationTimers).forEach(key => delete notificationTimers[key]);
}

let draggedItem = null;

function createTaskElement(task) {
    const li = document.createElement("li");
    li.draggable = true;

    li.dataset.category = task.category || "";
    li.dataset.taskId = task.id;
    li.dataset.priority = task.priority || "Medium";
    li.dataset.position = task.position || 0;
    li.dataset.createdAt = task.created_at; 
    li.dataset.goalId = task.goal_id || ""; 

    if (task.is_done) {
        li.classList.add("finished");
    }

    const taskDueDateTime = task.due_date ? new Date(task.due_date) : null;
    if (taskDueDateTime && !isNaN(taskDueDateTime.getTime())) {
        const today = new Date();
        today.setHours(0, 0, 0, 0); 

        const taskDateOnly = new Date(taskDueDateTime);
        taskDateOnly.setHours(0, 0, 0, 0); 

        const diffTime = taskDateOnly.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        li.classList.remove("task-due-today", "task-overdue");
        if (diffDays < 0) { 
            li.classList.add('overdue-task');
        } else if (diffDays === 0) { 
            li.classList.add('today-task');
        } else {
            li.classList.add('future-task');
        }
    } else {
        li.classList.add('no-due-date');
    }

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.is_done || false;

    checkbox.addEventListener("change", async () => {
      const taskId = li.dataset.taskId;
      const isChecked = checkbox.checked;

      if (taskId) {
        await updateTask(taskId, { is_done: isChecked });
      }
      await loadTasks(); 
    });
    li.appendChild(checkbox);

    const span = document.createElement("span");
    span.classList.add("task-text");
    span.innerHTML = marked.parse(task.content || "");
    span.setAttribute("data-raw", task.content || "");
    li.appendChild(span);
    
    if (task.attachments && task.attachments.length > 0) {
        const attachmentIcon = document.createElement("span");
        attachmentIcon.classList.add("attachment-icon"); 
        attachmentIcon.innerHTML = `🗂️`; 
        attachmentIcon.title = "View attachments";
        attachmentIcon.style.cursor = "pointer";
        attachmentIcon.addEventListener("click", async () => { 
            let attachmentListHtml = "<h3>Attachments:</h3><ul>";
            for (const att of task.attachments) { 
                let attachmentUrl = att.url; 
                if (currentUser && att.file_path) { 
                    const { data, error } = await supabase.storage
                        .from('task-attachments') 
                        .createSignedUrl(att.file_path, 60 * 60); 
                    if (error) {
                        console.error("Error creating signed URL:", error.message);
                        attachmentUrl = "#";
                        showCustomAlert("Failed to generate signed URL for " + att.name);
                    } else {
                        attachmentUrl = data.signedUrl;
                    }
                }
                attachmentListHtml += `<li><a href="${attachmentUrl}" target="_blank" rel="noopener noreferrer">${att.name}</a></li>`;
            }
            attachmentListHtml += "</ul>";
            showCustomAlert(attachmentListHtml);
        });
        li.appendChild(attachmentIcon);
    }
    const subtaskProgressDisplay = document.createElement("span");
    subtaskProgressDisplay.classList.add("subtask-progress-display");
    if (task.subtasks && task.subtasks.length > 0) {
        const completedSubtasks = task.subtasks.filter(st => st.is_done).length;
        subtaskProgressDisplay.textContent = `✅ ${completedSubtasks}/${task.subtasks.length}`;
    } else {
        subtaskProgressDisplay.textContent = ``;
    }
    li.appendChild(subtaskProgressDisplay);

    const recurrenceLabel = document.createElement("span");
    recurrenceLabel.classList.add("recurrence-label");
    if (task.recurrence_type && task.recurrence_type !== 'none') {
        let recurrenceText = '';
        switch (task.recurrence_type) {
            case 'daily': recurrenceText = 'Daily'; break;
            case 'weekly':
                const days = task.recurrence_details.daysOfWeek || [];
                recurrenceText = `Weekly (${days.map(d => d.substring(0, 3)).join(', ')})`;
                break;
            case 'monthly':
                recurrenceText = `Monthly (day ${task.recurrence_details.dayOfMonth || '?'})`;
                break;
            case 'yearly':
                recurrenceText = `Yearly (on ${new Date(task.recurrence_details.monthAndDay || '2000-01-01').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})`;
                break;
        }
        recurrenceLabel.textContent = `🔁 ${recurrenceText}`;
        recurrenceLabel.title = `Repeats: ${recurrenceText}`;
    } else {
        recurrenceLabel.textContent = '';
    }
    li.appendChild(recurrenceLabel);

    // NEW: Goal Label Display
    const goalLabel = document.createElement("span");
    goalLabel.classList.add("goal-label");
    if (task.goal_id) {
        const linkedGoal = allGoals.find(g => g.id === task.goal_id);
        if (linkedGoal) {
            goalLabel.textContent = `🎯 ${linkedGoal.title}`;
            goalLabel.title = `Linked to Goal: ${linkedGoal.title}`;
            goalLabel.style.cursor = "pointer";
            goalLabel.addEventListener("click", () => {
                document.getElementById("goalsSection").style.display = "block";
                document.getElementById("tasksPanel").style.display = "none";
                document.getElementById("toggleGoals").classList.add("active");
                document.getElementById("toggleNotes").classList.remove("active");

                document.getElementById("goalSearchInput").value = ""; 
                document.getElementById("goalStatusFilter").value = "all"; 
                document.getElementById("goalSortOrder").value = "dueDateAsc"; 
                filterGoals(); 
            });
        } else {
            goalLabel.textContent = `🎯 Unlinked Goal`;
            goalLabel.title = `Linked to unknown goal ID: ${task.goal_id}`;
        }
    } else {
        goalLabel.textContent = '';
    }
    li.appendChild(goalLabel);
    
    const notificationTimeDisplay = document.createElement("span");
    notificationTimeDisplay.classList.add("notification-time-display");
    if (task.notification_time !== null && task.notification_time > 0 && task.due_date) {
        const dueDateTime = new Date(task.due_date);
        if (!isNaN(dueDateTime.getTime())) {
            const notificationTimestamp = dueDateTime.getTime() - (task.notification_time * 60 * 1000);
            const actualNotificationTime = new Date(notificationTimestamp);
            notificationTimeDisplay.textContent = `🔔 ${actualNotificationTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        } else {
            notificationTimeDisplay.textContent = `🔔 Invalid Due Date for Notification`;
        }
    } else {
        notificationTimeDisplay.textContent = ``;
    }
    li.appendChild(notificationTimeDisplay); 

    const dueDateDisplay = document.createElement("span");
    dueDateDisplay.classList.add("due-date-display");
    if (taskDueDateTime && !isNaN(taskDueDateTime.getTime())) {
        let dateString = taskDueDateTime.toLocaleDateString();
        let timeString = '';
        if (taskDueDateTime.getUTCHours() !== 0 || taskDueDateTime.getUTCMinutes() !== 0) {
             timeString = taskDueDateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        dueDateDisplay.textContent = `📅 ${dateString}` + (timeString ? ` ${timeString}` : '');
    } else {
        dueDateDisplay.textContent = '';
    }
    li.appendChild(dueDateDisplay); 

    const categoryLabel = document.createElement("span");
    categoryLabel.classList.add("category-label");
    categoryLabel.textContent = `🏷️ ${task.category || "Personal"}`;
    categoryLabel.dataset.category = task.category || "";
    categoryLabel.style.cursor = "pointer";
    categoryLabel.title = `Filter by ${task.category || "Personal"}`;

    categoryLabel.addEventListener("click", (e) => {
      const categoryFilter = document.getElementById("categoryFilter");
      if (categoryFilter) {
        categoryFilter.value = task.category || "all";
        filterTasks(); 
      }
    });
    li.appendChild(categoryLabel);

    const priorityLabel = document.createElement("span");
    priorityLabel.classList.add("priority-label");
    priorityLabel.textContent = `⚡ ${task.priority || "Medium"}`;
    priorityLabel.style.cursor = "pointer";
    priorityLabel.title = `Filter by priority: ${task.priority || "Medium"}`;

    priorityLabel.addEventListener("click", (e) => {
      const priorityFilter = document.getElementById("priorityFilter");
      if (priorityFilter) {
        priorityFilter.value = task.priority || "all";
        filterTasks(); 
      }
    });
    li.appendChild(priorityLabel); 

    const taskActions = document.createElement("div");
    taskActions.classList.add("task-actions");

    const editBtn = document.createElement("button");
    editBtn.classList.add("edit-button");
    editBtn.style.cursor = "pointer";
    editBtn.title = "Edit task";
    editBtn.innerHTML = EDIT_ICON_SVG;
    editBtn.setAttribute('aria-label', 'Edit task');
    editBtn.addEventListener("click", () => showEditModal(task)); // Call showEditModal
    taskActions.appendChild(editBtn);

    // Delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "";
    deleteBtn.classList.add("delete-button");
    deleteBtn.innerHTML = DELETE_ICON_SVG;
    deleteBtn.title = "Delete task";
    deleteBtn.setAttribute('aria-label', 'Delete task');
    deleteBtn.addEventListener("click", async () => {
      showCustomConfirm("Are you sure you want to delete this task?", async () => {
          const taskId = li.dataset.taskId;
          await deleteTask(taskId);
          await loadTasks(); 
      });
    });
    taskActions.appendChild(deleteBtn);

    li.appendChild(taskActions);

    const subtasksContainer = document.createElement("div");
    subtasksContainer.classList.add("subtasks-container");
    if (expandedTaskIds.has(task.id)) {
        subtasksContainer.style.display = "block";
    } else {
        subtasksContainer.style.display = "none";
    }

    const subtaskInputGroup = document.createElement("div");
    subtaskInputGroup.classList.add("subtask-input-group");

    const subtaskInput = document.createElement("input");
    subtaskInput.type = "text";
    subtaskInput.placeholder = "Add a sub-task...";
    subtaskInput.classList.add("input", "subtask-input");

    const addSubtaskButton = document.createElement("button");
    addSubtaskButton.textContent = "Add Sub-task";
    addSubtaskButton.classList.add("button", "add-subtask-button");
    addSubtaskButton.addEventListener("click", async () => {
        const content = subtaskInput.value.trim();
        if (content) {
            await addSubTask(task.id, content);
            subtaskInput.value = "";
            await loadTasks();
        } else {
            showCustomAlert("Sub-task content cannot be empty.");
        }
    });
    subtaskInput.addEventListener("keypress", async (e) => {
        if (e.key === "Enter") {
            const content = subtaskInput.value.trim();
            if (content) {
                await addSubTask(task.id, content);
                subtaskInput.value = "";
                await loadTasks(); 
            } else {
                showCustomAlert("Sub-task content cannot be empty.");
            }
        }
    });

    subtaskInputGroup.appendChild(subtaskInput);
    subtaskInputGroup.appendChild(addSubtaskButton);
    subtasksContainer.appendChild(subtaskInputGroup);

    const subtaskList = document.createElement("ul");
    subtaskList.classList.add("subtask-list");
    subtasksContainer.appendChild(subtaskList);

    li.appendChild(subtasksContainer);

    const toggleSubtasksBtn = document.createElement("button");
    toggleSubtasksBtn.classList.add("toggle-subtasks-button");
    toggleSubtasksBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-6">
            <path fill-rule="evenodd" d="M12.53 16.28a.75.75 0 0 1-1.06 0l-7.5-7.5a.75.75 0 0 1 1.06-1.06L12 14.69l6.97-6.97a.75.75 0 1 1 1.06 1.06l-7.5 7.5Z" clip-rule="evenodd" />
        </svg>
    `;

    if (expandedTaskIds.has(task.id)) {
        toggleSubtasksBtn.classList.add("expanded"); 
    } else {
        toggleSubtasksBtn.classList.remove("expanded");
    }

    toggleSubtasksBtn.title = "Toggle subtasks";
    toggleSubtasksBtn.addEventListener("click", () => {
        const isExpanded = subtasksContainer.style.display === "block";
        subtasksContainer.style.display = isExpanded ? "none" : "block";
        
        if (isExpanded) {
            expandedTaskIds.delete(task.id);
        } else {
            expandedTaskIds.add(task.id);
        }

        toggleSubtasksBtn.classList.toggle("expanded", !isExpanded);
    });
    li.insertBefore(toggleSubtasksBtn, li.querySelector(".task-actions")); 

    if (task.subtasks && task.subtasks.length > 0) {
        task.subtasks.forEach(subtask => {
            const subtaskLi = createSubTaskElement(task.id, subtask);
            subtaskList.appendChild(subtaskLi);
        });
    }



    li.addEventListener("dragstart", e => {
      li.classList.add("dragging");
      draggedItem = li; 
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", null); 
    });

    li.addEventListener("dragend", () => {
      li.classList.remove("dragging");
      draggedItem = null; 
      [...taskList.children].forEach(item => {
          item.classList.remove("dragover-top", "dragover-bottom");
          item.style.borderTop = "";
          item.style.borderBottom = "";
      });
      updateTaskPositionsInDB();
    });

    li.addEventListener("dragover", e => {
      e.preventDefault(); 
      if (!draggedItem || draggedItem === li) return;


      const currentDragoverTop = taskList.querySelector(".dragover-top");
      if (currentDragoverTop && currentDragoverTop !== li) {
          currentDragoverTop.classList.remove("dragover-top");
          currentDragoverTop.style.borderTop = "";
      }
      const currentDragoverBottom = taskList.querySelector(".dragover-bottom");
      if (currentDragoverBottom && currentDragoverBottom !== li) {
          currentDragoverBottom.classList.remove("dragover-bottom");
          currentDragoverBottom.style.borderBottom = "";
      }

      const rect = li.getBoundingClientRect();
      const offset = e.clientY - rect.top;

      if (offset < rect.height / 2) {
        li.classList.add("dragover-top");
        li.style.borderTop = "2px solid var(--highlight-color)";
        li.style.borderBottom = ""; 
      } else {
        li.classList.add("dragover-bottom"); 
        li.style.borderBottom = "2px solid var(--highlight-color)";
        li.style.top = ""; 
      }
    });

    li.addEventListener("dragleave", () => {
      if (li !== draggedItem) {
          li.classList.remove("dragover-top", "dragover-bottom");
          li.style.borderTop = "";
          li.style.bottom = "";
      }
    });

    li.addEventListener("drop", e => {
      e.preventDefault();
      if (!draggedItem || draggedItem === li) return;

      li.classList.remove("dragover-top", "dragover-bottom");
      li.style.borderTop = "";
      li.style.bottom = "";

      const rect = li.getBoundingClientRect();
      const offset = e.clientY - rect.top;

      if (offset < rect.height / 2) {
        taskList.insertBefore(draggedItem, li);
      } else {
        taskList.insertBefore(draggedItem, li.nextSibling);
      }
    });
    
    return li;
  }

function createSubTaskElement(parentTaskId, subtask) {
    const li = document.createElement("li");
    li.classList.add("subtask-item");
    li.dataset.subtaskId = subtask.id;
    li.dataset.parentTaskId = parentTaskId;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = subtask.is_done || false;
    checkbox.addEventListener("change", async () => {
        await toggleSubTask(parentTaskId, subtask.id, checkbox.checked);
        const subtaskTextSpan = li.querySelector(".subtask-text");
        if (subtaskTextSpan) {
            if (checkbox.checked) {
                subtaskTextSpan.classList.add("finished");
            } else {
                subtaskTextSpan.classList.remove("finished");
            }
        }
        const parentTaskElement = document.querySelector(`li[data-task-id="${parentTaskId}"]`);
        if (parentTaskElement) {
            const parentTask = allTasks.find(t => t.id == parentTaskId);
            if (parentTask && parentTask.subtasks) {
                const completedSubtasks = parentTask.subtasks.filter(st => st.is_done).length;
                const subtaskProgressDisplay = parentTaskElement.querySelector(".subtask-progress-display");
                if (subtaskProgressDisplay) {
                    subtaskProgressDisplay.textContent = `✅ ${completedSubtasks}/${parentTask.subtasks.length}`;
                }
            }
        }
        await loadGoals();
    });
    li.appendChild(checkbox);

    const span = document.createElement("span");
    span.classList.add("subtask-text");
    span.textContent = subtask.content;
    if (subtask.is_done) {
        span.classList.add("finished");
    }
    li.appendChild(span);

    const deleteBtn = document.createElement("button");
    deleteBtn.classList.add("delete-button", "subtask-delete-button");
    deleteBtn.innerHTML = DELETE_ICON_SVG;
    deleteBtn.title = "Delete sub-task";
    deleteBtn.setAttribute('aria-label', 'Delete sub-task');
    deleteBtn.addEventListener("click", async () => {
        showCustomConfirm("Are you sure you want to delete this sub-task?", async () => {
            await deleteSubTask(parentTaskId, subtask.id);
            await loadTasks(); // Reload to update UI
        });
    });
    li.appendChild(deleteBtn);

    return li;
}

async function addSubTask(parentTaskId, content) {
    const parentTask = allTasks.find(task => task.id == parentTaskId);
    if (!parentTask) {
        console.error("Parent task not found for adding sub-task:", parentTaskId);
        return;
    }

    const newSubtask = {
        id: crypto.randomUUID(), 
        content: content,
        is_done: false,
    };

    if (!parentTask.subtasks) {
        parentTask.subtasks = [];
    }
    parentTask.subtasks.push(newSubtask);

    await updateTask(parentTaskId, { subtasks: parentTask.subtasks });
}

async function toggleSubTask(parentTaskId, subtaskId, isDone) {
    const parentTask = allTasks.find(task => task.id == parentTaskId);
    if (!parentTask || !parentTask.subtasks) {
        console.error("Parent task or subtasks not found for toggling sub-task:", parentTaskId);
        return;
    }

    const subtaskIndex = parentTask.subtasks.findIndex(st => st.id == subtaskId);
    if (subtaskIndex !== -1) {
        parentTask.subtasks[subtaskIndex].is_done = isDone;
        await updateTask(parentTaskId, { subtasks: parentTask.subtasks });
    }
}

async function deleteSubTask(parentTaskId, subtaskId) {
    const parentTask = allTasks.find(task => task.id == parentTaskId);
    if (!parentTask || !parentTask.subtasks) {
        console.error("Parent task or subtasks not found for deleting sub-task:", parentTaskId);
        return;
    }

    parentTask.subtasks = parentTask.subtasks.filter(st => st.id != subtaskId);
    await updateTask(parentTaskId, { subtasks: parentTask.subtasks });
}

let newSelectedFiles = [];

async function addTaskFromInput() {
    const taskInput = document.getElementById("taskInput");
    const categorySelect = document.getElementById("categorySelect");
    const prioritySelect = document.getElementById("prioritySelect");
    const dueDateInput = document.getElementById("dueDate"); 
    const dueTimeInput = document.getElementById("dueTime"); 
    const newAttachmentsDisplay = document.getElementById("newAttachmentsDisplay"); 
    const goalSelect = document.getElementById("goalSelect"); 

    const recurrenceTypeSelect = document.getElementById("recurrenceType");
    const recurrenceDetailsContainer = document.getElementById("recurrenceDetails");

    const taskText = taskInput.value.trim();
    if (!taskText) {
        showCustomAlert("Please enter a task description.");
        return;
    }

    const category = categorySelect.value;
    const priority = prioritySelect.value;
    const goalId = goalSelect.value === "none" ? null : goalSelect.value; 

    let dueDateTime = null;
    const datePart = dueDateInput.value;
    const timePart = dueTimeInput.value;

    if (datePart) {
        const combinedLocalDateTimeString = `${datePart}T${timePart || '00:00'}:00`;
        const localDateObj = new Date(combinedLocalDateTimeString);

        if (!isNaN(localDateObj.getTime())) {
            dueDateTime = localDateObj.toISOString();
        } else {
            console.error("addTaskFromInput - Invalid date/time parsed:", combinedLocalDateTimeString);
        }
    }

    const recurrenceType = recurrenceTypeSelect.value;
    let recurrenceDetails = {};
    if (recurrenceType !== 'none') {
        recurrenceDetails = getRecurrenceDetails(recurrenceType, recurrenceDetailsContainer);
    }

    const attachments = [];
    // For new tasks, we first add the task without attachments, then upload attachments
    // and update the task with attachment info. This is because Supabase Storage
    // paths often rely on a task ID.
    // So, we'll store the files in a temporary array and handle them after task creation.
    const filesToUploadAfterTaskCreation = [...newSelectedFiles];
    newSelectedFiles = [];

    const newTask = await addTask(taskText, category, priority, dueDateTime, null, [], recurrenceType, recurrenceDetails, goalId);

    if (!newTask) return;

    const uploadedAttachments = [];
    for (const file of filesToUploadAfterTaskCreation) {
        const attachmentInfo = await handleFileUpload(newTask.id, file); // Pass the real taskId
        if (attachmentInfo) {
            uploadedAttachments.push(attachmentInfo);
        }
    }
    
    if (uploadedAttachments.length > 0) {
        await updateTask(newTask.id, { attachments: uploadedAttachments });
    }


    taskInput.value = "";
    categorySelect.value = "Personal";
    prioritySelect.value = "Medium";
    dueDateInput.value = "";
    dueTimeInput.value = "";
    recurrenceTypeSelect.value = "none"; 
    renderRecurrenceDetails('none', recurrenceDetailsContainer); 
    goalSelect.value = "none"; 
    
    newAttachmentsDisplay.innerHTML = ''; 

    updateTaskCounter();
    await loadTasks(); 
    await loadGoals(); 
}


function showCustomAlert(message) {
    const modal = document.createElement('div');
    modal.classList.add('custom-modal');
    modal.innerHTML = `
        <div class="custom-modal-content">
            <p>${message}</p>
            <button class="custom-modal-button">OK</button>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('.custom-modal-button').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

function showCustomConfirm(message, onConfirm) {
    const modal = document.createElement('div');
    modal.classList.add('custom-modal');
    modal.innerHTML = `
        <div class="custom-modal-content">
            <p>${message}</p>
            <div class="custom-modal-actions">
                <button class="custom-modal-button confirm-button">Yes</button>
                <button class="custom-modal-button cancel-button">No</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('.confirm-button').addEventListener('click', () => {
        document.body.removeChild(modal);
        onConfirm();
    });

    modal.querySelector('.cancel-button').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

function showCustomPrompt(message, onConfirm, defaultValue = '') {
    const modal = document.createElement('div');
    modal.classList.add('custom-modal');
    modal.innerHTML = `
        <div class="custom-modal-content">
            <p>${message}</p>
            <input type="text" class="custom-modal-input" value="${defaultValue}">
            <div class="custom-modal-actions">
                <button class="custom-modal-button confirm-button">OK</button>
                <button class="custom-modal-button cancel-button">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const input = modal.querySelector('.custom-modal-input');
    input.focus();

    modal.querySelector('.confirm-button').addEventListener('click', () => {
        document.body.removeChild(modal);
        onConfirm(input.value);
    });

    modal.querySelector('.cancel-button').addEventListener('click', () => {
        document.body.removeChild(modal);
        onConfirm(null);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            modal.querySelector('.confirm-button').click(); // Corrected to confirm-button
        } else if (e.key === 'Escape') {
            modal.querySelector('.cancel-button').click(); // Corrected to cancel-button
        }
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
            onConfirm(null);
        }
    });
}

const editTaskModal = document.getElementById("editTaskModal");
const closeEditModalButton = document.getElementById("closeEditModal"); 
const saveEditButton = document.getElementById("saveEditButton");
const cancelEditButton = document.getElementById("cancelEditButton");

const editTaskId = document.getElementById("editTaskId");
const editTaskContent = document.getElementById("editTaskContent");
const editCategorySelect = document.getElementById("editCategorySelect");
const editPrioritySelect = document.getElementById("editPrioritySelect");
const editDueDate = document.getElementById("editDueDate");
const editDueTime = document.getElementById("editDueTime");
const editNotificationOffset = document.getElementById("editNotificationOffset"); 
const editAttachmentInput = document.getElementById("editAttachmentInput"); 
const currentAttachmentsDisplay = document.getElementById("currentAttachmentsDisplay"); 
const editGoalSelect = document.getElementById("editGoalSelect"); 
const editRecurrenceTypeSelect = document.getElementById("editRecurrenceType");
const editRecurrenceDetailsContainer = document.getElementById("editRecurrenceDetails");


let attachmentsToKeep = [];

function showEditModal(task) {
    editTaskId.value = task.id;
    editTaskContent.value = task.content;
    
    ensureOptionExists(editCategorySelect, task.category);
    ensureOptionExists(editPrioritySelect, task.priority);

    editCategorySelect.value = task.category || "Personal";
    editPrioritySelect.value = "Medium";
    if (task.priority) {
        editPrioritySelect.value = task.priority;
    } else {
        const mediumOption = Array.from(editPrioritySelect.options).find(opt => opt.value === "Medium");
        if (mediumOption) {
            editPrioritySelect.value = "Medium";
        } else if (editPrioritySelect.options.length > 0) {
            editPrioritySelect.value = editPrioritySelect.options[0].value;
        }
    }

 if (task.due_date) {
    const dueDateObj = new Date(task.due_date); 
    if (!isNaN(dueDateObj.getTime())) {
        const year = dueDateObj.getFullYear();
        const month = String(dueDateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dueDateObj.getDate()).padStart(2, '0');
        editDueDate.value = `${year}-${month}-${day}`; 
        const localHours = String(dueDateObj.getHours()).padStart(2, '0');
        const localMinutes = String(dueDateObj.getMinutes()).padStart(2, '0');
        editDueTime.value = `${localHours}:${localMinutes}`;
    } else {
        editDueDate.value = '';
        editDueTime.value = '';
    }
} else {
    editDueDate.value = '';
    editDueTime.value = '';
}

    editNotificationOffset.value = task.notification_time !== null ? task.notification_time : '';

    editRecurrenceTypeSelect.value = task.recurrence_type || 'none';
    renderRecurrenceDetails(editRecurrenceTypeSelect.value, editRecurrenceDetailsContainer, task.recurrence_details);

    editGoalSelect.value = task.goal_id || 'none';


    attachmentsToKeep = [...(task.attachments || [])]; // Initialize with existing attachments
    renderAttachments(attachmentsToKeep, currentAttachmentsDisplay, task.id, true); // Render existing, allow removal

    editTaskModal.style.display = "flex"; // Use flex to center
}

function ensureOptionExists(selectElement, value) {
    if (value && value !== "__custom__") {
        const exists = Array.from(selectElement.options).some(opt => opt.value === value);
        if (!exists) {
            const newOption = document.createElement("option");
            newOption.value = value;
            newOption.textContent = value;
            selectElement.insertBefore(newOption, selectElement.lastElementChild);
        }
    }
}


function hideEditModal() {
    editTaskModal.style.display = "none";
    editAttachmentInput.value = ""; 
    currentAttachmentsDisplay.innerHTML = ""; 
    attachmentsToKeep = []; 
}

async function saveEditedTask() {
    const taskId = editTaskId.value;
    const content = editTaskContent.value.trim();
    const category = editCategorySelect.value;
    const priority = editPrioritySelect.value;
    const dueDate = editDueDate.value; 
    const dueTime = editDueTime.value; 
    const notificationOffset = editNotificationOffset.value ? parseInt(editNotificationOffset.value, 10) : null;
    const goalId = editGoalSelect.value === "none" ? null : editGoalSelect.value; 

    const recurrenceType = editRecurrenceTypeSelect.value;
    let recurrenceDetails = {};
    if (recurrenceType !== 'none') {
        recurrenceDetails = getRecurrenceDetails(recurrenceType, editRecurrenceDetailsContainer);
    }

    if (!content) {
        showCustomAlert("Task content cannot be empty.");
        return;
    }

    let updatedDueDateTime = null;
    if (dueDate) {

        const combinedLocalDateTimeString = `${dueDate}T${dueTime || '00:00'}:00`;
        const localDateObj = new Date(combinedLocalDateTimeString);

        if (!isNaN(localDateObj.getTime())) {
            updatedDueDateTime = localDateObj.toISOString();
        } else {
            console.error("saveEditedTask - Invalid date/time parsed:", combinedLocalDateTimeString);
        }
    }

    const newAttachments = [];
    if (editAttachmentInput.files.length > 0) {
        for (const file of editAttachmentInput.files) {
            const attachmentInfo = await handleFileUpload(taskId, file); 
            if (attachmentInfo) {
                newAttachments.push(attachmentInfo);
            }
        }
    }

    const finalAttachments = [...attachmentsToKeep, ...newAttachments];

    let updates = {
        content: content,
        category: category,
        priority: priority,
        due_date: updatedDueDateTime,
        notification_time: notificationOffset, 
        attachments: finalAttachments, 
        recurrence_type: recurrenceType, 
        recurrence_details: recurrenceDetails, 
        goal_id: goalId, 
    };

    const currentTaskInAllTasks = allTasks.find(t => t.id == taskId);
    if (currentTaskInAllTasks && (currentTaskInAllTasks.recurrence_type !== recurrenceType || currentTaskInAllTasks.due_date !== updatedDueDateTime)) {
        if (recurrenceType !== 'none' && updatedDueDateTime) {
            updates.next_occurrence_date = calculateNextOccurrence(new Date(updatedDueDateTime), recurrenceType, recurrenceDetails).toISOString();
        } else {
            updates.next_occurrence_date = null;
        }
    }


    try {
        await updateTask(taskId, updates);
        await loadTasks();
        hideEditModal();
        showCustomAlert("Task updated successfully!");
    } catch (error) {
        console.error("Error saving edited task:", error);
        showCustomAlert("Failed to save task changes.");
    }
}

/**
 * Handles file upload to Supabase Storage or stores as base64 for guest mode.
 * @param {string} taskId The ID of the task this attachment belongs to.
 * @param {File} file The file object to upload.
 * @returns {Promise<Object|null>} A promise that resolves to an object { name, url, type, file_path (for supabase) } or null on error.
 */
async function handleFileUpload(taskId, file) {
    if (currentUser) {
        const filePath = `${currentUser.id}/${taskId || 'temp'}/${Date.now()}-${file.name}`; 

        try {
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('task-attachments') 
                .upload(filePath, file, {
                    cacheControl: '3600',
                    upsert: false 
                });

            if (uploadError) {
                console.error("Supabase file upload failed:", uploadError.message);
                showCustomAlert("File upload failed: " + uploadError.message);
                return null;
            }

            const { data: signedUrlData, error: signedUrlError } = await supabase.storage
                .from('task-attachments') 
                .createSignedUrl(uploadData.path, 60 * 60 * 24 * 7); 

            if (signedUrlError) {
                console.error("Error creating signed URL after upload:", signedUrlError.message);
                showCustomAlert("Failed to generate signed URL for uploaded file.");
                await supabase.storage.from('task-attachments').remove([uploadData.path]);
                return null;
            }

            return { 
                id: crypto.randomUUID(),
                name: file.name, 
                url: signedUrlData.signedUrl, 
                type: file.type,
                file_path: uploadData.path 
            };

        } catch (e) {
            console.error("Error during Supabase file upload process:", e);
            showCustomAlert("An error occurred during file upload.");
            return null;
        }

    } else {
        console.warn("Guest mode: Files are stored as Base64 data URLs in local storage. They are not uploaded to a server and will be lost if local storage is cleared.");
        showCustomAlert("Attachments in Guest Mode are stored locally and are not persistent. Log in for full attachment functionality.");
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                resolve({
                    id: crypto.randomUUID(), 
                    name: file.name,
                    url: e.target.result, 
                    type: file.type,
                    file_path: null 
                });
            };
            reader.onerror = (e) => {
                console.error("Error reading file for guest mode:", e);
                showCustomAlert("Error reading file for guest mode.");
                resolve(null);
            };
            reader.readAsDataURL(file);
        });
    }
}

/**
 * Renders attachment links in a given container.
 * @param {Array<Object>} attachments Array of attachment objects { name, url, type, file_path }.
 * @param {HTMLElement} container The DOM element to render attachments into.
 * @param {string} taskId The ID of the parent task.
 * @param {boolean} editable If true, includes a remove button for each attachment.
 */
function renderAttachments(attachments, container, taskId, editable) {
    container.innerHTML = '';
    attachments.forEach(attachment => {
        const attachmentItem = document.createElement('span');
        attachmentItem.classList.add('attachment-item');

        const link = document.createElement('a');
        link.href = "#";
        link.textContent = attachment.name;
        link.target = "_blank";
        link.rel = "noopener noreferrer";

        link.addEventListener('click', async (e) => {
            e.preventDefault(); 
            if (currentUser && attachment.file_path) {
                const { data, error } = await supabase.storage
                    .from('task-attachments') 
                    .createSignedUrl(attachment.file_path, 60 * 60);
                if (error) {
                    console.error("Error creating signed URL for display:", error.message);
                    showCustomAlert("Failed to open file: " + attachment.name + ". Please try again.");
                } else {
                    window.open(data.signedUrl, '_blank');
                }
            } else if (attachment.url) {
                window.open(attachment.url, '_blank');
            } else {
                showCustomAlert("Cannot open attachment. No valid URL or file path found.");
            }
        });
        
        attachmentItem.appendChild(link);

        if (editable) {
            const removeBtn = document.createElement('button');
            removeBtn.classList.add('remove-attachment-btn');
            removeBtn.textContent = 'x';
            removeBtn.title = `Remove ${attachment.name}`;
            removeBtn.addEventListener('click', () => {
                removeAttachment(taskId, attachment.id, attachment.file_path); 
            });
            attachmentItem.appendChild(removeBtn);
        }
        container.appendChild(attachmentItem);
    });
}

/**
 * Removes an attachment from a task.
 * @param {string} taskId The ID of the task.
 * @param {string} attachmentId The ID of the attachment (used for guest mode).
 * @param {string} filePath The file path in Supabase Storage (used for logged-in users).
 */
async function removeAttachment(taskId, attachmentId, filePath) {
    showCustomConfirm("Are you sure you want to remove this attachment?", async () => {
        const task = allTasks.find(t => t.id == taskId);
        if (!task) {
            console.error("Task not found for attachment removal.");
            return;
        }

        let updatedAttachments = [];

        if (currentUser && filePath) {
            try {
                const { error: storageError } = await supabase.storage
                    .from('task-attachments')
                    .remove([filePath]);

                if (storageError) {
                    console.error("Error deleting file from Supabase Storage:", storageError.message);
                    showCustomAlert("Failed to delete file from storage: " + storageError.message);
                }
            } catch (e) {
                console.error("Error during Supabase Storage deletion process:", e);
                showCustomAlert("An error occurred during file deletion from storage.");
            }
            updatedAttachments = task.attachments.filter(att => att.file_path !== filePath);
        } else {
            updatedAttachments = task.attachments.filter(att => att.id !== attachmentId);
        }

        await updateTask(taskId, { attachments: updatedAttachments });
        attachmentsToKeep = updatedAttachments;
        renderAttachments(attachmentsToKeep, currentAttachmentsDisplay, taskId, true); // Re-render attachments in modal
        await loadTasks(); 
        showCustomAlert("Attachment removed.");
    });
}

const categoryFilter = document.getElementById("categoryFilter");
const priorityFilter = document.getElementById("priorityFilter");
const sortOrder = document.getElementById("sortOrder");
const showCompleted = document.getElementById("showCompleted");
const clearFiltersButton = document.getElementById("clearFiltersButton");
const goalFilter = document.getElementById("goalFilter"); // NEW: Goal filter for tasks


function populateCategoryFilter(tasks) {
    const categories = new Set(tasks.map(task => task.category).filter(Boolean)); 
    categoryFilter.innerHTML = '<option value="all">All Categories</option>'; 
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        categoryFilter.appendChild(option);
    });
    const currentCategory = categoryFilter.dataset.currentValue || 'all';
    if (Array.from(categoryFilter.options).some(opt => opt.value === currentCategory)) {
        categoryFilter.value = currentCategory;
    } else {
        categoryFilter.value = 'all';
    }
}

function populatePriorityFilter(tasks) {
    const priorities = new Set(tasks.map(task => task.priority).filter(Boolean));
    priorityFilter.innerHTML = '<option value="all">All Priorities</option>';
    const defaultPriorities = ["Scheduled", "Urgent", "High", "Medium", "Low"];
    defaultPriorities.forEach(p => {
        if (!priorities.has(p)) {
            priorities.add(p);
        }
    });

    const sortedPriorities = Array.from(priorities).sort((a, b) => {
        const order = { "Urgent": 1, "High": 2, "Medium": 3, "Low": 4, "Scheduled": 5 };
        return (order[a] || 99) - (order[b] || 99);
    });

    sortedPriorities.forEach(p => {
        const option = document.createElement('option');
        option.value = p;
        option.textContent = p;
        priorityFilter.appendChild(option);
    });
    const currentPriority = priorityFilter.dataset.currentValue || 'all';
    if (Array.from(priorityFilter.options).some(opt => opt.value === currentPriority)) {
        priorityFilter.value = currentPriority;
    } else {
        priorityFilter.value = 'all';
    }
}

function filterTasks() {
    const searchTerm = document.getElementById("searchInput").value.toLowerCase().trim();
    const selectedCategory = categoryFilter.value;
    const selectedPriority = priorityFilter.value;
    const currentSortOrder = sortOrder.value;
    const shouldShowCompleted = showCompleted.checked;
    const selectedGoal = goalFilter.value; 

    categoryFilter.dataset.currentValue = selectedCategory;
    priorityFilter.dataset.currentValue = selectedPriority;
    sortOrder.dataset.currentValue = currentSortOrder;
    showCompleted.dataset.currentValue = shouldShowCompleted;
    goalFilter.dataset.currentValue = selectedGoal; 

    let filteredAndSortedTasks = allTasks.filter(task => {
        const contentMatch = task.content.toLowerCase().includes(searchTerm);
        const categoryMatch = selectedCategory === "all" || task.category === selectedCategory;
        const priorityMatch = selectedPriority === "all" || task.priority === selectedPriority;
        
        const goalMatch = selectedGoal === "all" || 
                         (selectedGoal === "no-goal" && !task.goal_id) ||
                         (selectedGoal !== "no-goal" && task.goal_id === selectedGoal);

        const subtaskMatch = task.subtasks && task.subtasks.some(subtask => 
            subtask.content.toLowerCase().includes(searchTerm)
        );
        const attachmentMatch = task.attachments && task.attachments.some(attachment =>
            attachment.name.toLowerCase().includes(searchTerm)
        );

        const completionMatch = shouldShowCompleted || !task.is_done;

        return (contentMatch || subtaskMatch || attachmentMatch) && categoryMatch && priorityMatch && completionMatch && goalMatch;
    });

    filteredAndSortedTasks.sort((a, b) => {
        if (currentSortOrder === "dueDateAsc") {
            const dateA = a.due_date ? new Date(a.due_date).getTime() : Infinity;
            const dateB = b.due_date ? new Date(b.due_date).getTime() : Infinity;
            return dateA - dateB;
        } else if (currentSortOrder === "dueDateDesc") {
            const dateA = a.due_date ? new Date(a.due_date).getTime() : -Infinity;
            const dateB = b.due_date ? new Date(b.due_date).getTime() : -Infinity;
            return dateB - dateA;
        } else if (currentSortOrder === "priorityHighToLow") {
            const priorityOrder = { "Urgent": 1, "High": 2, "Medium": 3, "Low": 4, "Scheduled": 5 };
            return (priorityOrder[a.priority] || 99) - (priorityOrder[b.priority] || 99);
        } else if (currentSortOrder === "priorityLowToHigh") {
            const priorityOrder = { "Urgent": 1, "High": 2, "Medium": 3, "Low": 4, "Scheduled": 5 };
            return (priorityOrder[b.priority] || 99) - (priorityOrder[a.priority] || 99);
        } else if (currentSortOrder === "creationDateDesc") {
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();
            return dateB - dateA;
        } else if (currentSortOrder === "alphabeticalAsc") {
            return a.content.localeCompare(b.content);
        } else if (currentSortOrder === "alphabeticalDesc") {
            return b.content.localeCompare(a.content);
        }
        return 0; 
    });

    renderTasks(filteredAndSortedTasks);
    updateTaskCounter();
}

// Debounce function
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        const later = () => {
            timeout = null;
            func.apply(context, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, delay);
    };
}

function clearAllFilters() {
    document.getElementById("searchInput").value = "";
    categoryFilter.value = "all";
    priorityFilter.value = "all";
    sortOrder.value = "creationDateDesc"; 
    showCompleted.checked = false;
    goalFilter.value = "all";
    filterTasks();
}

/**
 * Renders the appropriate recurrence details UI based on the selected type.
 * @param {string} type The recurrence type ('none', 'daily', 'weekly', 'monthly', 'yearly').
 * @param {HTMLElement} container The DOM element to render details into (e.g., recurrenceDetails, editRecurrenceDetails).
 * @param {Object} [currentDetails={}] Optional: Current recurrence details to pre-fill inputs.
 */
function renderRecurrenceDetails(type, container, currentDetails = {}) {
    container.innerHTML = ''; 
    container.style.display = 'none';

    if (type === 'none') {
        return;
    }

    container.style.display = 'flex'; 

    let html = '';
    switch (type) {
        case 'daily':
            html = `
                <label for="${container.id}-endDate">Ends:</label>
                <input type="date" id="${container.id}-endDate" class="date-input" value="${currentDetails.endDate || ''}">
            `;
            break;
        case 'weekly':
            const daysOfWeek = [
                { value: 'sunday', label: 'Sun' },
                { value: 'monday', label: 'Mon' },
                { value: 'tuesday', label: 'Tue' },
                { value: 'wednesday', label: 'Wed' },
                { value: 'thursday', label: 'Thu' },
                { value: 'friday', label: 'Fri' },
                { value: 'saturday', label: 'Sat' },
            ];
            html = `
                <label>Repeat on:</label>
                <div class="checkbox-group">
                    ${daysOfWeek.map(day => `
                        <label>
                            <input type="checkbox" data-day="${day.value}" ${currentDetails.daysOfWeek && currentDetails.daysOfWeek.includes(day.value) ? 'checked' : ''}>
                            ${day.label}
                        </label>
                    `).join('')}
                </div>
                <label for="${container.id}-endDate">Ends:</label>
                <input type="date" id="${container.id}-endDate" class="date-input" value="${currentDetails.endDate || ''}">
            `;
            break;
        case 'monthly':
            html = `
                <label for="${container.id}-dayOfMonth">Day of month:</label>
                <input type="number" id="${container.id}-dayOfMonth" class="input" min="1" max="31" value="${currentDetails.dayOfMonth || ''}">
                <label for="${container.id}-endDate">Ends:</label>
                <input type="date" id="${container.id}-endDate" class="date-input" value="${currentDetails.endDate || ''}">
            `;
            break;
        case 'yearly':
            html = `
                <label for="${container.id}-monthAndDay">On:</label>
                <input type="date" id="${container.id}-monthAndDay" class="date-input" value="${currentDetails.monthAndDay ? currentDetails.monthAndDay.substring(0, 10) : ''}">
                <label for="${container.id}-endDate">Ends:</label>
                <input type="date" id="${container.id}-endDate" class="date-input" value="${currentDetails.endDate || ''}">
            `;
            break;
    }
    container.innerHTML = html;
}

/**
 * Extracts recurrence details from the UI.
 * @param {string} type The recurrence type.
 * @param {HTMLElement} container The DOM element containing the recurrence details.
 * @returns {Object} An object with recurrence details.
 */
function getRecurrenceDetails(type, container) {
    const details = {};
    const endDateInput = container.querySelector(`#${container.id}-endDate`);
    if (endDateInput && endDateInput.value) {
        details.endDate = endDateInput.value;
    }

    switch (type) {
        case 'weekly':
            details.daysOfWeek = Array.from(container.querySelectorAll('input[type="checkbox"]:checked'))
                .map(cb => cb.dataset.day);
            break;
        case 'monthly':
            const dayOfMonthInput = container.querySelector(`#${container.id}-dayOfMonth`);
            if (dayOfMonthInput && dayOfMonthInput.value) {
                details.dayOfMonth = parseInt(dayOfMonthInput.value, 10);
            }
            break;
        case 'yearly':
            const monthAndDayInput = container.querySelector(`#${container.id}-monthAndDay`);
            if (monthAndDayInput && monthAndDayInput.value) {
                details.monthAndDay = monthAndDayInput.value; // YYYY-MM-DD format
            }
            break;
    }
    return details;
}

/**
 * Calculates the next occurrence date for a recurring task.
 * @param {Date} lastOccurrenceDate The date of the last occurrence (or initial due date).
 * @param {string} recurrenceType The type of recurrence ('daily', 'weekly', 'monthly', 'yearly').
 * @param {Object} recurrenceDetails Details like daysOfWeek, dayOfMonth, monthAndDay.
 * @returns {Date|null} The next occurrence date, or null if no further occurrences.
 */
function calculateNextOccurrence(lastOccurrenceDate, recurrenceType, recurrenceDetails) {
    let nextDate = new Date(lastOccurrenceDate);
    const endDate = recurrenceDetails.endDate ? new Date(recurrenceDetails.endDate) : null;
    if (endDate) endDate.setHours(23, 59, 59, 999); // Set to end of day for comparison

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize today to start of day

    switch (recurrenceType) {
        case 'daily':
            nextDate.setDate(nextDate.getDate() + 1);
            break;
        case 'weekly':
            const daysOfWeek = recurrenceDetails.daysOfWeek || [];
            if (daysOfWeek.length === 0) return null; 

            let foundNextDay = false;
            for (let i = 1; i <= 7; i++) { 
                const potentialNextDate = new Date(lastOccurrenceDate);
                potentialNextDate.setDate(potentialNextDate.getDate() + i);
                const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][potentialNextDate.getDay()];
                if (daysOfWeek.includes(dayName)) {
                    nextDate = potentialNextDate;
                    foundNextDay = true;
                    break;
                }
            }
            if (!foundNextDay) {
                nextDate.setDate(lastOccurrenceDate.getDate() + 7);
            }
            break;
        case 'monthly':
            const dayOfMonth = recurrenceDetails.dayOfMonth;
            if (!dayOfMonth) return null;

            nextDate.setDate(dayOfMonth);
            if (nextDate.getTime() <= lastOccurrenceDate.getTime()) {
                nextDate.setMonth(nextDate.getMonth() + 1);
                nextDate.setDate(dayOfMonth); 
            }
            if (nextDate.getDate() !== dayOfMonth) {
                nextDate.setDate(1); 
                nextDate.setMonth(nextDate.getMonth() + 1);
                nextDate.setDate(dayOfMonth);
            }
            break;
        case 'yearly':
            const monthAndDay = recurrenceDetails.monthAndDay;
            if (!monthAndDay) return null;
            const [, month, day] = monthAndDay.split('-').map(Number); 

            nextDate.setMonth(month - 1);
            nextDate.setDate(day);
            
            if (nextDate.getTime() <= lastOccurrenceDate.getTime()) {
                nextDate.setFullYear(nextDate.getFullYear() + 1);
            }
            break;
    }

    nextDate.setHours(lastOccurrenceDate.getHours(), lastOccurrenceDate.getMinutes(), lastOccurrenceDate.getSeconds(), lastOccurrenceDate.getMilliseconds());

    if (endDate && nextDate.getTime() > endDate.getTime()) {
        return null; 
    }

    return nextDate;
}

async function generateRecurringTasks() {
    console.log("Checking for recurring tasks to generate...");
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // NEW: Recurring tasks now work in BOTH Supabase (logged-in) mode and
    // guest/local-storage mode, instead of silently doing nothing for guests.
    let recurringTasks = [];
    let guestTasks = null; // only populated (and written back) in guest mode

    if (currentUser) {
        const { data, error } = await supabase
            .from("tasks")
            .select("*, subtasks, attachments, recurrence_type, recurrence_details, original_task_id, next_occurrence_date")
            .eq("user_id", currentUser.id)
            .eq("is_done", false)
            .not("recurrence_type", "eq", "none");

        if (error) {
            console.error("Error fetching recurring tasks:", error.message);
            return;
        }
        recurringTasks = data || [];
    } else {
        guestTasks = getGuestTasks();
        recurringTasks = guestTasks.filter(t => !t.is_done && t.recurrence_type && t.recurrence_type !== 'none');
    }

    let guestIdOffset = 0;
    let generatedAny = false;

    for (const task of recurringTasks) {
        if (!task.next_occurrence_date) continue;

        let nextOccurrence = new Date(task.next_occurrence_date);
        nextOccurrence.setHours(0, 0, 0, 0);

        while (nextOccurrence.getTime() <= today.getTime()) {
            console.log(`Generating new instance for recurring task: "${task.content}" (Original ID: ${task.id}) due on ${nextOccurrence.toLocaleDateString()}`);

            // Guard against a missing/invalid due_date on the original task so
            // this doesn't throw and silently abort the whole batch.
            const sourceDueDate = task.due_date ? new Date(task.due_date) : null;
            const sourceHours = sourceDueDate && !isNaN(sourceDueDate.getTime()) ? sourceDueDate.getHours() : 9;
            const sourceMinutes = sourceDueDate && !isNaN(sourceDueDate.getTime()) ? sourceDueDate.getMinutes() : 0;

            const newInstance = {
                content: task.content,
                is_done: false,
                category: task.category,
                priority: task.priority,
                due_date: new Date(nextOccurrence.getFullYear(), nextOccurrence.getMonth(), nextOccurrence.getDate(),
                                   sourceHours, sourceMinutes).toISOString(),
                position: 0,
                notification_time: task.notification_time,
                subtasks: task.subtasks ? task.subtasks.map(st => ({ ...st, is_done: false, id: crypto.randomUUID() })) : [],
                attachments: task.attachments || [],
                recurrence_type: 'none',
                recurrence_details: {},
                original_task_id: task.id,
                next_occurrence_date: null,
                created_at: new Date().toISOString(),
                goal_id: task.goal_id || null,
            };

            if (currentUser) {
                newInstance.user_id = currentUser.id;
                const { error: insertError } = await supabase.from("tasks").insert([newInstance]).select();
                if (insertError) {
                    console.error("Error creating recurring task instance:", insertError.message);
                    break;
                }
            } else {
                newInstance.id = Date.now() + (guestIdOffset++);
                guestTasks.push(newInstance);
            }
            generatedAny = true;

            const calculatedNext = calculateNextOccurrence(new Date(task.next_occurrence_date), task.recurrence_type, task.recurrence_details);

            if (calculatedNext) {
                task.next_occurrence_date = calculatedNext.toISOString();
                nextOccurrence = new Date(task.next_occurrence_date);
                nextOccurrence.setHours(0, 0, 0, 0);
            } else {
                task.next_occurrence_date = null;
                break;
            }
        }

        if (currentUser) {
            const { error: updateError } = await supabase
                .from("tasks")
                .update({ next_occurrence_date: task.next_occurrence_date })
                .eq("id", task.id)
                .eq("user_id", currentUser.id);

            if (updateError) {
                console.error("Error updating original recurring task:", updateError.message);
            }
        } else {
            const originalIndex = guestTasks.findIndex(t => t.id === task.id);
            if (originalIndex !== -1) {
                guestTasks[originalIndex].next_occurrence_date = task.next_occurrence_date;
            }
        }
    }

    if (!currentUser && guestTasks) {
        saveGuestTasks(guestTasks);
        if (generatedAny) {
            console.log("Recurring task instances generated in Local Storage (Guest Mode).");
        }
    }

    await loadTasks();
    await loadGoals();
}


let quill = null;

const noteSearchInput = document.getElementById("noteSearchInput");
const noteCategoryFilter = document.getElementById("noteCategoryFilter");
const newNoteButton = document.getElementById("newNoteButton");
const deleteNoteButton = document.getElementById("deleteNoteButton");
const saveNoteButton = document.getElementById("saveNoteButton");
const noteTitleInput = document.getElementById("noteTitleInput");
const noteCategorySelect = document.getElementById("noteCategorySelect");

function populateNoteCategoryFilter(notes) {
    const categories = new Set(notes.map(note => note.category).filter(Boolean));
    noteCategoryFilter.innerHTML = '<option value="all">All Categories</option>';
    const defaultCategories = ["General", "Ideas", "Meeting", "Project", "Personal"];
    defaultCategories.forEach(cat => {
        if (!categories.has(cat)) {
            categories.add(cat);
        }
    });

    Array.from(categories).sort().forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        noteCategoryFilter.appendChild(option);
    });

    const currentCategory = noteCategoryFilter.dataset.currentValue || 'all';
    if (Array.from(noteCategoryFilter.options).some(opt => opt.value === currentCategory)) {
        noteCategoryFilter.value = currentCategory;
    } else {
        noteCategoryFilter.value = 'all';
    }
}

function filterNotes() {
    const searchTerm = noteSearchInput.value.toLowerCase().trim();
    const selectedCategory = noteCategoryFilter.value;
    const noteSortOrder = document.getElementById("noteSortOrder")?.value || "newest";


    let filteredNotes = allNotes.filter(note => {
        const titleMatch = note.title.toLowerCase().includes(searchTerm);
        const contentMatch = note.content.toLowerCase().includes(searchTerm); // Search in HTML content too
        const categoryMatch = selectedCategory === "all" || note.category === selectedCategory;
        return (titleMatch || contentMatch) && categoryMatch;
    });

    filteredNotes.sort((a, b) => {
        if (noteSortOrder === "newest") {
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        } else if (noteSortOrder === "oldest") {
            return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
        } else if (noteSortOrder === "alphabetical") {
            return a.title.localeCompare(b.title);
        }
        return 0;
    });

    renderNoteList(filteredNotes);
}

const goalSearchInput = document.getElementById("goalSearchInput");
const goalStatusFilter = document.getElementById("goalStatusFilter");
const goalSortOrder = document.getElementById("goalSortOrder");

function filterGoals() {
    const searchTerm = goalSearchInput.value.toLowerCase().trim();
    const selectedStatus = goalStatusFilter.value;
    const currentSortOrder = goalSortOrder.value;

    let filteredAndSortedGoals = allGoals.filter(goal => {
        const titleMatch = goal.title.toLowerCase().includes(searchTerm);
        const descriptionMatch = goal.description.toLowerCase().includes(searchTerm);
        const statusMatch = selectedStatus === "all" || goal.status === selectedStatus;
        return (titleMatch || descriptionMatch) && statusMatch;
    });

    filteredAndSortedGoals.sort((a, b) => {
        if (currentSortOrder === "dueDateAsc") {
            const dateA = a.due_date ? new Date(a.due_date).getTime() : Infinity;
            const dateB = b.due_date ? new Date(b.due_date).getTime() : Infinity;
            return dateA - dateB;
        } else if (currentSortOrder === "creationDateDesc") {
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();
            return dateB - dateA;
        } else if (currentSortOrder === "alphabeticalAsc") {
            return a.title.localeCompare(b.title);
        } else if (currentSortOrder === "custom") {
            const posA = a.position ?? Number.MAX_SAFE_INTEGER;
            const posB = b.position ?? Number.MAX_SAFE_INTEGER;
            if (posA === posB) {
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            }
            return posA - posB;
        }
        return 0;
    });

    renderGoals(filteredAndSortedGoals);
}

const goalModal = document.getElementById("goalModal");
const goalModalTitle = document.getElementById("goalModalTitle");
const goalIdInput = document.getElementById("goalId");
const goalTitleInput = document.getElementById("goalTitle");
const goalDescriptionInput = document.getElementById("goalDescription");
const goalStartDateInput = document.getElementById("goalStartDate");
const goalDueDateInput = document.getElementById("goalDueDate");
const goalStatusSelect = document.getElementById("goalStatus");
const saveGoalButton = document.getElementById("saveGoalButton");
const cancelGoalButton = document.getElementById("cancelGoalButton");
const closeGoalModalButton = document.getElementById("closeGoalModal");

function showGoalModal(goal = null) {
    if (goal) {
        goalModalTitle.textContent = "Edit Goal";
        goalIdInput.value = goal.id;
        goalTitleInput.value = goal.title;
        goalDescriptionInput.value = goal.description || "";
        goalStartDateInput.value = goal.start_date ? goal.start_date.substring(0, 10) : "";
        goalDueDateInput.value = goal.due_date ? goal.due_date.substring(0, 10) : "";
        goalStatusSelect.value = goal.status || "active";
    } else {
        goalModalTitle.textContent = "Add New Goal";
        goalIdInput.value = "";
        goalTitleInput.value = "";
        goalDescriptionInput.value = "";
        goalStartDateInput.value = new Date().toISOString().substring(0, 10);
        goalDueDateInput.value = "";
        goalStatusSelect.value = "active";
    }
    goalModal.style.display = "flex";
}

function hideGoalModal() {
    goalModal.style.display = "none";
}

async function saveGoal() {
    const goalId = goalIdInput.value;
    const title = goalTitleInput.value.trim();
    const description = goalDescriptionInput.value.trim();
    const startDate = goalStartDateInput.value;
    const dueDate = goalDueDateInput.value;
    const status = goalStatusSelect.value;

    if (!title) {
        showCustomAlert("Goal title cannot be empty.");
        return;
    }

    if (goalId) {
        await updateGoal(goalId, { title, description, start_date: startDate, due_date: dueDate, status });
        showCustomAlert("Goal updated successfully!");
    } else {
        await addGoal(title, description, startDate, dueDate, status);
        showCustomAlert("Goal added successfully!");
    }
    hideGoalModal();
}

function init() {
  console.log("App initialized ✅");

  checkUserAndLoadApp();

  document.getElementById("signUpBtn")?.addEventListener("click", async (event) => {
      event.preventDefault();
      const email = document.getElementById("emailInput").value;
      const password = document.getElementById("passwordInput").value;
      await signUpUser(email, password);
  });

  document.getElementById("signInBtn")?.addEventListener("click", async (event) => {
      event.preventDefault();
      const email = document.getElementById("emailInput").value;
      const password = document.getElementById("passwordInput").value;
      await signInUser(email, password);
  });

  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    await signOutUser();
  });

  document.getElementById("sendResetEmailBtn")?.addEventListener("click", async () => {
    const email = document.getElementById("emailInput").value;
    await resetPasswordForEmailUser(email);
  });

  if (setButton) setButton.addEventListener("click", () => setTimer());
  if (startButton) startButton.addEventListener("click", startTimer);
  if (pauseButton) pauseButton.addEventListener("click", pauseTimer);
  if (stopButton) stopButton.addEventListener("click", stopTimer);
  setTimerMode("pomodoro");

  const addTaskButton = document.getElementById("addTaskButton");
  const taskInput = document.getElementById("taskInput");
  const newAttachmentInput = document.getElementById("newAttachmentInput");
  const triggerNewAttachmentInput = document.getElementById("triggerNewAttachmentInput");
  const newAttachmentsDisplay = document.getElementById("newAttachmentsDisplay");
  const recurrenceTypeSelect = document.getElementById("recurrenceType");
  const recurrenceDetailsContainer = document.getElementById("recurrenceDetails");

  if (addTaskButton) addTaskButton.addEventListener("click", addTaskFromInput);
  if (taskInput) taskInput.addEventListener("keypress", e => {
    if (e.key === "Enter") addTaskFromInput();
  });

  if (recurrenceTypeSelect) {
      recurrenceTypeSelect.addEventListener("change", () => {
          renderRecurrenceDetails(recurrenceTypeSelect.value, recurrenceDetailsContainer);
      });
  }

  if (triggerNewAttachmentInput) {
      triggerNewAttachmentInput.addEventListener("click", () => {
          newAttachmentInput.click(); 
      });
  }

  if (newAttachmentInput) {
      newAttachmentInput.addEventListener("change", () => {
          newSelectedFiles = Array.from(newAttachmentInput.files); 
          newAttachmentsDisplay.innerHTML = '';
          if (newSelectedFiles.length > 0) {
              newSelectedFiles.forEach(file => {
                  const fileItem = document.createElement('span');
                  fileItem.classList.add('attachment-item');
                  fileItem.textContent = file.name;
                  newAttachmentsDisplay.appendChild(fileItem);
              });
          }
      });
  }


  const toggleNotesBtn = document.getElementById("toggleNotes");
  const notesSidebar = document.getElementById("notesSidebar");
  const closeNotesBtn = document.getElementById("closeNotes");

  toggleNotesBtn?.addEventListener("click", () => {
    notesSidebar?.classList.add("open");
    if (toggleNotesBtn) toggleNotesBtn.style.display = "active";
    document.body.classList.add("notes-open");
    document.getElementById("goalsSection").style.display = "none";
    document.getElementById("tasksPanel").style.display = "block";
    document.getElementById("toggleGoals").classList.remove("active");
  });

  closeNotesBtn?.addEventListener("click", () => {
    notesSidebar?.classList.remove("open");
    if (toggleNotesBtn) toggleNotesBtn.style.display = "block";
    document.body.classList.remove("notes-open");
    if (currentNoteId && quill) {
        const title = noteTitleInput.value.trim() || "Untitled Note";
        const content = quill.root.innerHTML;
        const category = noteCategorySelect.value;
        saveNote(currentNoteId, title, content, category);
    }
  });

  quill = new Quill('#notes-editor', {
    theme: 'snow',
    placeholder: 'Start writing your note...',
    modules: {
      toolbar: [
        [{ 'header': [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        [{ 'script': 'sub'}, { 'script': 'super' }],
        [{ 'indent': '-1'}, { 'indent': '+1' }],
        [{ 'direction': 'rtl' }],
        ['blockquote', 'code-block'],
        ['link'],
        [{ 'color': [] }, { 'background': [] }],
        [{ 'align': [] }],
        ['clean'] 
      ]
    }
  });

  newNoteButton?.addEventListener("click", createNote);
  deleteNoteButton?.addEventListener("click", () => deleteNote(currentNoteId));
  saveNoteButton?.addEventListener("click", () => {
      if (currentNoteId && quill) {
          const title = noteTitleInput.value.trim() || "Untitled Note";
          const content = quill.root.innerHTML;
          const category = noteCategorySelect.value;
          saveNote(currentNoteId, title, content, category);
          showCustomAlert("Note saved!");
      } else {
          showCustomAlert("No note selected or editor not ready.");
      }
  });

  noteTitleInput?.addEventListener('blur', () => {
      if (currentNoteId && quill) {
          const title = noteTitleInput.value.trim() || "Untitled Note";
          const content = quill.root.innerHTML;
          const category = noteCategorySelect.value;
          saveNote(currentNoteId, title, content, category);
      }
  });
  noteCategorySelect?.addEventListener('change', () => {
      if (currentNoteId && quill) {
          const title = noteTitleInput.value.trim() || "Untitled Note";
          const content = quill.root.innerHTML;
          const category = noteCategorySelect.value;
          saveNote(currentNoteId, title, content, category);
      }
  });
  quill.on('text-change', debounce(() => {
      if (currentNoteId) {
          const title = noteTitleInput.value.trim() || "Untitled Note";
          const content = quill.root.innerHTML;
          const category = noteCategorySelect.value;
          saveNote(currentNoteId, title, content, category);
      }
  }, 1000));

  noteSearchInput?.addEventListener("input", debounce(filterNotes, 300));
  noteCategoryFilter?.addEventListener("change", filterNotes);
  document.getElementById("noteSortOrder")?.addEventListener("change", filterNotes); 
  noteCategorySelect?.addEventListener("change", () => {
    if (noteCategorySelect.value === "__custom__") {
      showCustomPrompt("Enter new note category name:", (newCategory) => {
          if (newCategory && newCategory.trim()) {
            const trimmedCategory = newCategory.trim();
            const exists = Array.from(noteCategorySelect.options).some(
              option => option.value.toLowerCase() === trimmedCategory.toLowerCase()
            );
            if (!exists) {
              const newOption = document.createElement("option");
              newOption.value = trimmedCategory;
              newOption.textContent = trimmedCategory;
              noteCategorySelect.insertBefore(newOption, noteCategorySelect.lastElementChild);
              noteCategorySelect.value = trimmedCategory;
              if (currentNoteId && quill) {
                const title = noteTitleInput.value.trim() || "Untitled Note";
                const content = quill.root.innerHTML;
                saveNote(currentNoteId, title, content, trimmedCategory);
              }
            } else {
              showCustomAlert("That category already exists.");
              noteCategorySelect.value = "General";
            }
          } else {
            noteCategorySelect.value = "General";
          }
      }, "General");
    }
  });


  const toggleGoalsBtn = document.getElementById("toggleGoals");
  const goalsSection = document.getElementById("goalsSection");
  const tasksPanel = document.getElementById("tasksPanel");

  toggleGoalsBtn?.addEventListener("click", () => {
    if (goalsSection.style.display === "none") {
        goalsSection.style.display = "block";
        tasksPanel.style.display = "none";
        toggleGoalsBtn.classList.add("active");
        notesSidebar?.classList.remove("open");
        document.body.classList.remove("notes-open");
        toggleNotesBtn.classList.remove("active");
        filterGoals(); 
    } else {
        goalsSection.style.display = "none";
        tasksPanel.style.display = "block";
        toggleGoalsBtn.classList.remove("active");
        filterTasks(); 
    }
  });

  const addNewGoalButton = document.getElementById("addNewGoalButton");
  if (addNewGoalButton) addNewGoalButton.addEventListener("click", () => showGoalModal());
  if (saveGoalButton) saveGoalButton.addEventListener("click", saveGoal);
  if (cancelGoalButton) cancelGoalButton.addEventListener("click", hideGoalModal);
  if (closeGoalModalButton) closeGoalModalButton.addEventListener("click", hideGoalModal);
  window.addEventListener("click", (event) => {
    if (event.target === goalModal) {
      hideGoalModal();
    }
  });

  goalSearchInput?.addEventListener("input", debounce(filterGoals, 300));
  goalStatusFilter?.addEventListener("change", filterGoals);
  goalSortOrder?.addEventListener("change", filterGoals);

  document.getElementById('resetCountBtn')?.addEventListener('click', async () => {
    showCustomConfirm("Are you sure you want to delete all tasks? This cannot be undone.", async () => {
        if (currentUser) {
            const { error } = await supabase.from('tasks').delete().eq('user_id', currentUser.id);
            if (error) console.error("Error resetting all tasks for user:", error.message);
            else {
                await loadTasks(); 
                showCustomAlert("All tasks reset for your account.");
                clearAllScheduledNotifications();
            }
        } else {
            saveGuestTasks([]);
            await loadTasks(); 
        }
    });
  });

  document.getElementById('clearFinishedBtn')?.addEventListener('click', async () => {
    const finishedTasksElements = taskList.querySelectorAll('li.finished');
    const tasksToDeleteIds = [];

    finishedTasksElements.forEach(li => {
      const taskId = li.dataset.taskId;
      if (taskId) {
        tasksToDeleteIds.push(Number(taskId));
      }
    });

    if (tasksToDeleteIds.length > 0) {
      if (currentUser) {
        const { data: tasksWithAttachments, error: fetchError } = await supabase
            .from('tasks')
            .select('id, attachments')
            .in('id', tasksToDeleteIds)
            .eq('user_id', currentUser.id);

        if (fetchError) {
            console.error("Error fetching tasks for attachment deletion:", fetchError.message);
            showCustomAlert("Error fetching tasks for attachment cleanup.");
        } else if (tasksWithAttachments) {
            for (const task of tasksWithAttachments) {
                if (task.attachments && task.attachments.length > 0) {
                    const filePathsToDelete = task.attachments.map(att => att.file_path).filter(Boolean);
                    if (filePathsToDelete.length > 0) {
                        const { error: storageError } = await supabase.storage
                            .from('task-attachments')
                            .remove(filePathsToDelete);
                        if (storageError) {
                            console.error("Error deleting attachments from storage:", storageError.message);
                        }
                    }
                }
            }
        }

        const { error } = await supabase
          .from("tasks")
          .delete()
          .in("id", tasksToDeleteIds)
          .eq("user_id", currentUser.id);

        if (error) console.error("Failed to delete finished tasks from Supabase:", error.message);
        else console.log("Finished tasks deleted from Supabase.");
      } else {
        let guestTasks = getGuestTasks();
        guestTasks = guestTasks.filter(task => !tasksToDeleteIds.includes(task.id));
        saveGuestTasks(guestTasks);
      }
      tasksToDeleteIds.forEach(id => clearScheduledNotification(id));
    }
    await updateTaskPositionsInDB();
    await loadTasks();
  });

  const categorySelect = document.getElementById("categorySelect");
  const prioritySelect = document.getElementById("prioritySelect");

  categorySelect?.addEventListener("change", () => {
    if (categorySelect.value === "__custom__") {
      showCustomPrompt("Enter new category name:", (newCategory) => {
          if (newCategory && newCategory.trim()) {
            const trimmedCategory = newCategory.trim();
            const exists = Array.from(categorySelect.options).some(
              option => option.value.toLowerCase() === trimmedCategory.toLowerCase()
            );
            if (!exists) {
              const newOption = document.createElement("option");
              newOption.value = trimmedCategory;
              newOption.textContent = trimmedCategory;
              categorySelect.insertBefore(newOption, categorySelect.lastElementChild);
              categorySelect.value = trimmedCategory;
            } else {
              showCustomAlert("That category already exists.");
              categorySelect.value = "Personal";
            }
          } else {
            categorySelect.value = "Personal";
          }
      }, "Personal");
    }
  });

  prioritySelect?.addEventListener("change", () => {
    if (prioritySelect.value === "__custom__") {
      showCustomPrompt("Enter new priority:", (newPriority) => {
          if (newPriority && newPriority.trim()) {
            const trimmedPriority = newPriority.trim();
            const exists = Array.from(prioritySelect.options).some(
              opt => opt.value.toLowerCase() === trimmedPriority.toLowerCase()
            );
            if (!exists) {
              const newOption = document.createElement("option");
              newOption.value = trimmedPriority;
              newOption.textContent = trimmedPriority;
              prioritySelect.insertBefore(newOption, prioritySelect.lastElementChild);
              prioritySelect.value = trimmedPriority;
            } else {
              showCustomAlert("That priority already exists.");
              prioritySelect.value = "Medium";
            }
          } else {
            prioritySelect.value = "Medium";
          }
      }, "Medium");
    }
  });

  if (cancelEditButton) { 
    cancelEditButton.addEventListener("click", hideEditModal);
  }
  if (saveEditButton) {
    saveEditButton.addEventListener("click", saveEditedTask);
  }

  window.addEventListener("click", (event) => {
    if (event.target === editTaskModal) {
      hideEditModal();
    }
  });

  editCategorySelect?.addEventListener("change", () => {
    if (editCategorySelect.value === "__custom__") {
      showCustomPrompt("Enter new category:", (newCategory) => {
          if (newCategory && newCategory.trim()) {
            const trimmedCategory = newCategory.trim();
            const exists = Array.from(editCategorySelect.options).some(
              opt => opt.value.toLowerCase() === trimmedCategory.toLowerCase()
            );
            if (!exists) {
              const newOption = document.createElement("option");
              newOption.value = trimmedCategory;
              newOption.textContent = trimmedCategory;
              editCategorySelect.insertBefore(newOption, editCategorySelect.lastElementChild);
              editCategorySelect.value = trimmedCategory;
            } else {
              showCustomAlert("That category already exists.");
              editCategorySelect.value = "Personal";
            }
          } else {
            editCategorySelect.value = "Personal";
          }
      }, "Personal");
    }
  });

  editPrioritySelect?.addEventListener("change", () => {
    if (editPrioritySelect.value === "__custom__") {
      showCustomPrompt("Enter new priority:", (newPriority) => {
          if (newPriority && newPriority.trim()) {
            const trimmedPriority = newPriority.trim();
            const exists = Array.from(editPrioritySelect.options).some(
              opt => opt.value.toLowerCase() === trimmedPriority.toLowerCase()
            );
            if (!exists) {
              const newOption = document.createElement("option");
              newOption.value = trimmedPriority;
              newOption.textContent = trimmedPriority;
              editPrioritySelect.insertBefore(newOption, editPrioritySelect.lastElementChild);
              editPrioritySelect.value = trimmedPriority;
            } else {
              showCustomAlert("That priority already exists.");
              editPrioritySelect.value = "Medium";
            }
          } else {
            editPrioritySelect.value = "Medium";
          }
      }, "Medium");
    }
  });

  if (editRecurrenceTypeSelect) {
      editRecurrenceTypeSelect.addEventListener("change", () => {
          renderRecurrenceDetails(editRecurrenceTypeSelect.value, editRecurrenceDetailsContainer);
      });
  }

  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
      searchInput.addEventListener("input", debounce(filterTasks, 300));
  }

  if (categoryFilter) {
      categoryFilter.addEventListener("change", filterTasks);
  }
  if (priorityFilter) {
      priorityFilter.addEventListener("change", filterTasks);
  }
  if (sortOrder) {
      sortOrder.addEventListener("change", filterTasks);
  }
  if (showCompleted) {
      showCompleted.addEventListener("change", filterTasks);
  }
  if (clearFiltersButton) {
      clearFiltersButton.addEventListener("click", clearAllFilters);
  }
  if (goalFilter) {
      goalFilter.addEventListener("change", filterTasks);
  }

} 

window.addEventListener("DOMContentLoaded", init);