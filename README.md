# The Bull Came Crashing Down

Source code for **Twilight of the Banyan Tree**, courtesy of Meniir, remodeled into **The Bull Came Crashing Down**, a historical political simulation about Joko Widodo's presidency of Indonesia in 2014-2019. It is mainly written in plain HTML, CSS and JavaScript. All of the game's content lives in JSON files, so events, factions, decrees and translations can be edited without touching the engine.

## About the game

> **October 2014.** PDI-P's man rises, from the bottom rung of society to the presidency, Joko Widodo has swept the election in 2014, defeating the self-exiled Prabowo Subianto. On October 19, all 700 delegates of the People's Consultative Assembly (MPR) will vote by secret ballot on your Accountability Speech. If 351 reject it, your presidency is over.

You play Habibie across 23 historical crises, from the aftermath of the June 7 election to the MPR General Session. Each crisis offers several responses, and none of them is free. You balance seven national stats, spend scarce Political Capital, and lobby ten factions to survive the vote.

## Features

- **23 crisis turns, then the MPR General Session.** Each crisis has 4–5 responses.
- **Seven national stats:** Popularity, Military Support, Reformasi Credibility, Economic Health, International Standing, National Stability and Cendana Influence. They affect each other.
- **Government Stability** acts as a hidden health bar. Stability brings bonuses, and instability brings compounding penalties.
- **Political Capital** is the currency for every decree and deal.
- **One executive action or decree, plus one faction engagement, per turn.** There are 36 routine executive actions and 33 extraordinary decrees across five categories: Economy, Civil Society, Security, Politics and Regional Affairs.
- **Ten factions** with their own moods, agendas and interactions: PDI-P, Golkar (Akbar Tandjung), Golkar (Habibie loyalists), Poros Tengah, ABRI, PPP, PKB, Utusan Daerah, Utusan Golongan and the minor parties.
- **Four difficulties:** Easy, Medium, High and Historical.
- **34 achievements.**
- **Auto-save and Continue.**
- **In-game Library:** a searchable reference of people, laws, institutions and acronyms.
- **Windows 95-inspired UI** with a Start menu, taskbar and loading screens, plus Windows 98 and Mac OS 8 window styles, color schemes, a custom desktop background, a built-in music player, and mobile support.

## Modding

> ## ⚠️ Modding is currently limited
>
> Some text, lists and game logic are still **hardcoded in `js/game.js`**, so you cannot freely add or restructure content by editing JSON alone. A future update will move text into separate localisation files (`en`, `id` and others), so that the data files only carry ids, in the way Paradox games handle modding.
>
> **Right now you can** edit and rebalance existing events, decrees, routine actions, factions, difficulty, stat tiers, the Library, achievement text and translations. **Adding new decrees, routine actions, factions or achievement conditions requires editing `game.js`.**

See the **[Modding Guide](docs/MODDING.md)** for the full disclaimer, what you can and cannot do, how to add content, and a reference of every data field with annotated examples.

## Localization

Indonesian text lives in `data/id/`, mirroring the English file layout. When the language is set to Indonesian, the game tries `data/id/<file>` first and falls back to the English file if it is missing. To translate another file, add it under `data/id/` with the same structure. A dedicated localisation system, where the data files only hold ids, is planned (see the [Modding Guide](docs/MODDING.md)).

## Debug tools

`js/debug.js` adds a **Debug MPR Election** button to the title screen and sidebar. It can jump straight to MPR election to Night of the Long Knives event. Achievements are disabled during debug elections unless you tick the option in the debug menu.

The script is **not** loaded by `index.html` by default. To use it locally, add this line after the other script tags:

```html
<script type="text/javascript" src="js/debug.js"></script>
```

Leave it out of release builds.

## Changelog

Player-facing update notes are stored in `data/updates.json`, newest first, and are shown in the game's "What's New" panel. Each entry looks like this:

```json
{ "version": "0.1", "date": "2026", "title": "Release title", "notes": ["First change", "Second change"] }
```

### Roadmap

- **0.2:** Indonesian translation with a reworked localization system
- **0.3:** 1999 Presidential Election
- **0.4:** Dynamic epilogues based on player choice
- **0.5:** Gameplay rework for more dynamism, reworked music and SFX, more achievements, minor mobile improvements
- **0.6:** Improved mobile experience
- **0.7:** Modding support
- **1.0:** Full release

## Contributing

Bug reports and corrections are welcome, especially:

- historical inaccuracies, with a source where possible
- typos and translation fixes
- balance feedback, with the difficulty and your choices

Open an issue or a pull request. For content changes, edit the JSON files in `data/` and keep the existing structure.

## AI disclosure

This project uses AI assistance to fix code, find errors, review code and research.

## Credits and support

Created by **Meniir**.

- X (Twitter): https://x.com/MeniirIII
- Contact: meniirs@proton.me
