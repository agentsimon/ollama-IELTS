document.addEventListener('DOMContentLoaded', () => {
    const pickCardBtn = document.getElementById('pickCardBtn');
    const cardDisplay = document.getElementById('cardDisplay');

    pickCardBtn.addEventListener('click', fetchAndDisplayCard);

    async function fetchAndDisplayCard() {
        try {
            // Fetch the JSON file
            const response = await fetch('topics2.json');
            if (!response.ok) {
                throw new Error('Network response was not ok ' + response.statusText);
            }
            const data = await response.json();

            // Get a random category
            const categories = Object.keys(data);
            if (categories.length === 0) {
                cardDisplay.innerHTML = `<p>No topics available.</p>`;
                return;
            }
            const randomCategory = categories[Math.floor(Math.random() * categories.length)];
            
            // Get a random card from the chosen category
            const cardsInCategory = data[randomCategory];
            if (cardsInCategory.length === 0) {
                cardDisplay.innerHTML = `<p>No cards available in this category.</p>`;
                return;
            }
            const randomCard = cardsInCategory[Math.floor(Math.random() * cardsInCategory.length)];

            // Display the card
            displayCard(randomCategory, randomCard);

        } catch (error) {
            console.error('There was a problem fetching the data:', error);
            cardDisplay.innerHTML = `<p style="color: red;">Error loading topics. Please check the file path.</p>`;
        }
    }

    function displayCard(category, card) {
        let cuesList = card.cues.map(cue => `<li>${cue}</li>`).join('');

        cardDisplay.innerHTML = `
            <h3>${card.topic}</h3>
            <h4>Cues:</h4>
            <ul>
                ${cuesList}
            </ul>
        `;
    }
});