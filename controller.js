/**
 * ELC ShowStore Controller by Timo Toups (timo@toups.eu)
 *
 * The ShowStoreController is a JavaScript class that manages the user interface and interactions
 * for a web-based application that controls the ELC ShowStore and its players. It allows the user to
 * select different modes (single player, multi-player, or recording), load and play shows, and
 * control playback using various buttons (play, stop, loop, hold, continue, restart).
 *
 * The controller communicates with a the ELC ShowStore to fetch show information (toc.xml, status.xml)
 * and player status updates. It sends control commands to the device to load shows, start/stop playback,
 * and perform other actions.
 *
 * The user interface consists of player elements, each containing a show selector, time display,
 * and control buttons. The controller dynamically updates the UI based on the selected mode and
 * the status received from the server. It also handles button clicks and show selection changes,
 * sending appropriate commands to the server.
 *
 * To enhance the user experience, the controller provides visual feedback by blinking buttons
 * during command execution and displaying confirmation modals when necessary (e.g., when switching
 * from multi-player to single-player mode).
 *
 * The controller stores the last selected mode in the browser's local storage, allowing the
 * application to restore the previous state when reopened.
 */

// Attach event listener to ensure DOM is fully loaded before initializing the application
document.addEventListener('DOMContentLoaded', function () {
  const app = new ShowStoreController();
  app.init();
});

// Define the ShowStoreController class to manage player modes and UI updates
class ShowStoreController {
  // Constructor to initialize properties related to mode selection and status updates
  constructor() {
    // Get references to DOM elements
    this.modeSelect = document.getElementById('mode-select');
    
    // Retrieve the last used player mode from local storage
    this.lastMode = localStorage.getItem('playerMode');
    
    // Initialize the status update interval to null
    this.statusUpdateInterval = null;
  }

  // Initialize the application by setting up the mode selector and fetching initial data
  init() {
    // If a last mode exists, set the mode selector, update player visibility, and start status updates
    if (this.lastMode) {
      this.modeSelect.value = this.lastMode;
      this.updatePlayerVisibility(this.lastMode);
      this.startStatusUpdates();
    }

    // Add event listener to handle mode changes
    this.modeSelect.addEventListener('change', this.handleModeChange.bind(this));
    
    // Fetch the table of contents (TOC) data
    this.fetchTOC();
    
    // Set up event listeners for player control buttons
    this.setupPlayerControls();
  }

  // Start periodic status updates for the players
  startStatusUpdates() {
    // Clear any existing status update interval
    if (this.statusUpdateInterval) {
      clearInterval(this.statusUpdateInterval);
    }
    
    // Set a new interval to fetch player status every 1 second
    this.statusUpdateInterval = setInterval(() => this.fetchStatus(), 1000);
  }

  // Stop the periodic status updates for the players
  stopStatusUpdates() {
    // Clear the status update interval if it exists
    if (this.statusUpdateInterval) {
      clearInterval(this.statusUpdateInterval);
      this.statusUpdateInterval = null;
    }
  }

  // Fetch current player status from the server
  fetchStatus() {
    this.fetchXML('status.xml', this.parseStatus.bind(this), 'Error fetching status:');
  }

  // Fetch table of contents XML data to populate show selectors
  fetchTOC() {
    this.fetchXML('toc.xml', this.updateShowSelectors.bind(this), 'Error fetching TOC:');
  }

  // General method to fetch XML data and handle the response or errors
  fetchXML(url, callback, errorMessage) {
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error('Network response was not ok');
        return response.text();
      })
      .then(callback)
      .catch((error) => console.error(errorMessage, error));
  }

  // Handle changes in player mode (multi show vs. single show)
  handleModeChange(event) {
    const selectElement = event.target;
    const newMode = selectElement.value;
    const oldMode = this.lastMode;

    // Check if confirmation is needed before changing the mode
    if (this.shouldConfirmModeChange(oldMode, newMode)) {
      const title = 'Confirm Mode Change';
      const message =
        'Switching to a <i>single player</i> mode will stop any ongoing playback on players 2 - 4.<br><br>Are you certain you want to proceed?';
      this.showConfirmationModal(title, message, () => this.changeMode(newMode), selectElement, oldMode);
    } else {
      // If confirmation is not needed, change the mode directly
      this.changeMode(newMode);
    }
  }

  // Check if confirmation is needed before changing the mode
  shouldConfirmModeChange(oldMode, newMode) {
    const multiShowModes = ['1', '2', '3'];
    const requiresConfirmationFrom = ['0', '4'];
    return multiShowModes.includes(oldMode) && requiresConfirmationFrom.includes(newMode);
  }

  // Show a confirmation modal with a title, message, and confirmation callback
  showConfirmationModal(title, htmlMessage, confirmCallback, selectElement, previousValue) {
    const modal = document.getElementById('modeChangeModal');
    modal.querySelector('.modal-title').textContent = title;
    modal.querySelector('.modal-body').innerHTML = htmlMessage;

    let isConfirmed = false;

    // Setup the confirm button
    const confirmButton = modal.querySelector('#confirmModeChange');
    confirmButton.onclick = () => {
      isConfirmed = true;
      confirmCallback();
      bootstrap.Modal.getInstance(modal).hide();
    };

    // Function to revert the select element to its previous value
    function revertSelect() {
      if (typeof selectElement === 'string') {
        document.getElementById(selectElement).value = previousValue;
      } else {
        selectElement.value = previousValue;
      }
    }

    // Setup listeners for modal close events
    modal.addEventListener('hidden.bs.modal', () => {
      if (!isConfirmed) {
        revertSelect();
      }
    });

    // Show the modal
    new bootstrap.Modal(modal).show();
  }

  // Apply the new mode, update local storage, and send control commands
  changeMode(mode) {
    localStorage.setItem('playerMode', mode);
    this.updatePlayerVisibility(mode);
    const commandMode = mode === '4' ? '0' : mode;
    // this.sendCommand(0, 'mode', commandMode);
    this.lastMode = commandMode;
  }

  // Set up event listeners for player control buttons
  setupPlayerControls() {
    // Add click event listeners to all player control buttons
    document.querySelectorAll('.player-control button').forEach((button) => {
      button.addEventListener('click', (e) => this.handleControlButtonClick(e, button));
    });
    
    // Add change event listeners to all show selectors
    document.querySelectorAll('[id^="show-player-"]').forEach((selector) => {
      selector.addEventListener('change', (event) => {
        const playerId = selector.id.split('-')[2];
        const showId = selector.value.padStart(2, '0');
        this.sendCommand(playerId, 'load', showId);
      });
    });
  }

  // Handle player control button clicks and manage visual feedback
  handleControlButtonClick(event, button) {
    // Find the parent player element
    const playerElement = button.closest('[id^="player-"]' || '[id^="recorder-"]');
    if (!playerElement) {
      console.error('Player element not found for button:', button);
      return;
    }
    
    // Extract the player ID and show ID
    const playerId = playerElement.id.split('-')[1];
    const showId = document.getElementById(`show-player-${playerId}`).value.padStart(2, '0');
    let command = button.id.split('-')[0];

    // Check if the button is a "hold" button and change the command if necessary
    if (button.id.includes('hold') && button.getAttribute('data-state') === 'active') {
      command = 'continue'; // Change command to 'continue'
    }

    // Set the button state to "clicked" and start blinking
    button.setAttribute('data-state', 'clicked');
    this.startBlinking(button);

    // Send the command to the server
    this.sendCommand(playerId, command, showId, () => {
      // Stop blinking when the command is executed
      clearInterval(button.blinkInterval);
      button.style.color = '';
    });
  }

  // Blink the button to indicate an ongoing action
  startBlinking(button) {
    if (button.blinkInterval) {
      clearInterval(button.blinkInterval);
    }

    const activeColor = 'var(--bs-body-color)';
    const originalColor = button.style.color;
    let isOriginalColor = true;

    // Set an interval to toggle the button color
    button.blinkInterval = setInterval(() => {
      if (button.getAttribute('data-state') === 'clicked') {
        button.style.color = isOriginalColor ? activeColor : originalColor;
        isOriginalColor = !isOriginalColor;
      } else {
        // Stop blinking when the button state changes
        clearInterval(button.blinkInterval);
        button.style.color = originalColor;
        button.removeAttribute('blinkInterval');
      }
    }, 333);
  }

  // Update UI elements to reflect the currently selected show options
  updateShowSelectors(xmlData) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlData, 'application/xml');
    const shows = xmlDoc.querySelectorAll('show');
    
    // Update each show selector with the available show options
    document.querySelectorAll('[id^="show-player-"]').forEach((selector) => {
      // Capture the first two options that should be preserved
      const preservedOptions = Array.from(selector.options).slice(0, 2);

      // Remove existing options beyond the first two
      while (selector.options.length > 2) {
        selector.remove(2);
      }

      // Append new show options from TOC XML
      shows.forEach((show) => {
        const option = document.createElement('option');
        option.value = show.getAttribute('index');
        option.textContent = show.textContent.trim();
        selector.appendChild(option);
      });

      // Restore the current show selection or set to default if not present
      if (!Array.from(selector.options).some((option) => option.value === selector.value)) {
        selector.value = '00';
      }
    });
  }

  // Update player visibility based on the current mode setting
  updatePlayerVisibility(mode) {
    const playerModes = {
      0: 1, // single player
      1: 4, // multi player HTP
      2: 4, // multi player LTP
      3: 4, // multi player Priority
      4: 1, // recording uses the single player setup and specific recording UI
    };
    const playerCount = playerModes[mode];

    // Enable or disable player divs based on the current player mode
    for (let i = 1; i <= 4; i++) {
      const player = document.getElementById(`player-${i}`);
      if (i <= playerCount && mode !== '4') {
        player.setAttribute('data-state', 'enabled');
      } else {
        player.setAttribute('data-state', 'disabled');
      }
    }

    // Special handling for recording mode
    // const recorder = document.getElementById('recorder-1');
    // if (mode === '4') {
    //   recorder.setAttribute('data-state', 'enabled');
    // } else {
    //   recorder.setAttribute('data-state', 'disabled');
    // }
  }

  // Update UI elements based on player status and manage button state
  updatePlayerStatus(player) {
    const index = player.getAttribute('index');
    const status = player.getAttribute('status').toLowerCase();
    const show = player.getAttribute('show');
    const time = player.getAttribute('time');

    const playerElement = document.getElementById(`player-${index}`);
    if (!playerElement) {
      console.error(`Player element #player-${index} not found`);
      return;
    }

    const showSelector = document.getElementById(`show-player-${index}`);
    if (showSelector) {
      showSelector.value = show;
    } else {
      console.error(`Show selector #show-player-${index} not found`);
    }

    // Update time display
    const timeDisplay = document.getElementById(`time-player-${index}`);
    if (timeDisplay) {
      if (show === '00') {
        timeDisplay.textContent = '--:--:--';
      } else {
        timeDisplay.textContent = time.replace('h', ':');
      }
    } else {
      console.error(`Time display #time-player-${index} not found`);
    }

    // Update control buttons states and stop blinking if necessary
    const controlButtons = playerElement.querySelectorAll('button');
    controlButtons.forEach((button) => {
      const buttonType = button.id.split('-')[0];
      const newState = show !== '00' ? 'enabled' : 'disabled';
      button.setAttribute('data-state', newState);
      if (buttonType === status && show !== '00') {
        button.setAttribute('data-state', 'active');
      }
      // Stop blinking when state changes from 'clicked'
      if (button.blinkInterval && button.getAttribute('data-state') !== 'clicked') {
        clearInterval(button.blinkInterval);
        button.style.color = '';
        button.removeAttribute('blinkInterval');
      }
    });
  }

  // Send player control commands to the ELC ShowStore and manage error handling
  sendCommand(playerId, command, showId = '') {
    const commandMap = {
      load: 'LD',
      play: 'ST',
      loop: 'LP',
      stop: 'SP',
      hold: 'HD',
      continue: 'CT',
      restart: 'RS',
      record: 'RC',
      mode: 'MS',
    };
    const requiresShowId = ['load', 'play', 'loop', 'record'];

    let asciiCommand = commandMap[command];
    if (command === 'mode') {
      asciiCommand += showId;
    } else {
      asciiCommand = playerId + asciiCommand;
      if (requiresShowId.includes(command)) {
        asciiCommand += showId.padStart(2, '0');
      }
    }

    const url = `/?${asciiCommand}`;
    fetch(url)
      .then(() => {
        console.log(`Command "${command}" sent with show ID "${showId}"`);
        this.stopStatusUpdates();
        setTimeout(() => this.startStatusUpdates(), 660);
      })
      .catch((error) => {
        console.error(`Error sending command:`, error);
        this.startStatusUpdates();
      });
  }

  // Parse player status from XML data and update UI components accordingly
  parseStatus(xmlData) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlData, 'application/xml');
    const players = xmlDoc.querySelectorAll('player');
    if (!players.length) {
      console.error('No player elements found in XML');
      return;
    }
    players.forEach((player) => {
      this.updatePlayerStatus(player);
      // Additional logic to stop blinking when status is parsed
      const playerId = player.getAttribute('index');
      const button = document.getElementById(`control-button-${playerId}`);
      if (button && button.blinkInterval) {
        clearInterval(button.blinkInterval);
        button.style.color = '';
        button.setAttribute('data-state', player.getAttribute('status').toLowerCase());
      }
    });
  }
}