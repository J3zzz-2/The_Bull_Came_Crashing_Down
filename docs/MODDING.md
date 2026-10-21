# Modding Guide

Guide to editing and extending the data files of **Twilight of the Banyan Tree**. Back to the [README](../README.md).

> **Paths:** the examples refer to files as `data/...`, `js/...` and `photo/...`, relative to the root of the repository, not to this `docs/` folder.

## Disclaimer and scope

> # ⚠️ IMPORTANT DISCLAIMER: MODDING IS CURRENTLY LIMITED ⚠️
>
> ## Some text, lists and game logic are still hardcoded in `js/game.js`.
>
> **Right now, you cannot freely add or restructure content by editing JSON alone.** Several things the game displays or checks are written directly into `js/game.js` (and a few into `js/election.js`), including:
>
> - the category lists that decide which routine actions and decrees appear on screen
> - the display names of stats and factions in effect previews
> - achievement unlock conditions
> - the specific event ids and option positions that trigger special mechanics (for example Bank Bali, East Timor, the Central Axis merger, the Accountability Speech and the Night of the Long Knives)
> - the list of factions and their leverage rules, plus some flavour lines
>
> **If you add something to the JSON without also editing `game.js`, it may not appear in the game, may not do anything, or may break an existing mechanic.** Even adding or reordering events can shift the turn numbers that faction interactions depend on.
>
> **This is a known limitation of the current version, not a bug in your mod.**
>
> ### The fix is planned
>
> A future update will move this text into **separate localisation files** (one per language, for example English and Indonesian, with room for others), in the way Paradox games handle modding. The files for `en` and `id` already exist. In that system, each entry in the JSON data (a date, a title, a description, an option) will only carry an **id**, and that id will be linked to the matching text in the localisation file for the selected language. Modders will then be able to add content and translations without editing the engine.
>
> The structure below is a **sketch of the direction, not a final format**:
>
> ```json
> { "id": "ev_example", "title": "ev_example.title", "date": "ev_example.date", "desc": "ev_example.desc" }
> ```
>
> ```
> en: { "ev_example.title": "Example Crisis", ... }
> id: { "ev_example.title": "Krisis Contoh", ... }
> ```
>
> Until that update, treat this guide as **advanced and unsupported**. Back up your files first, and expect that your changes may need to be redone when the new localisation system arrives.

### What you CAN do without touching `game.js`

You can safely change the **values and wording of content that already exists**, as long as you keep every `id` and the order of lists (especially the `options` in an event) the same:

- **Edit event text:** titles, dates, descriptions, option text and press reactions in `data/events.json`
- **Rebalance events:** change the `effects` numbers on any existing option (Political Capital, stats, faction loyalty, favors)
- **Rebalance decrees and routine actions:** change `baseCost`, `effects`, `description`, `alertMsg`, `cooldown`, requirements and locks on actions that already exist
- **Edit factions:** names, summaries, biographies, seat counts, moods and the text, costs and effects of their existing interactions in `data/fraksi/`
- **Retune difficulty:** starting Political Capital, stat bonuses, starting Cendana Influence, action cost modifiers and the maluses in `data/config.json`
- **Rename stat tiers:** the labels and colors in `data/stats.json`
- **Edit the Library, tutorial, history and credits:** add or change entries in `data/localization/`, `data/credits.json` and `data/updates.json`
- **Edit achievement text and icons:** titles, descriptions and images in `data/achievements.json`. The unlock conditions are still in code.
- **Change media:** music in `data/audio/music.json`, loading-screen messages in `data/loading.json`, and any image in `photo/` (keep the file names or update the paths)
- **Reskin the UI:** color schemes and window styles in `css/`
- **Translate:** edit or add files in `data/id/` that mirror the English files. Existing text in the game's JSON can be fully translated, but strings hardcoded in `game.js` cannot yet.

### What currently REQUIRES editing `game.js`

- Adding a **new routine action or decree** (its `id` must be added to a category list)
- Adding a **new faction**, stat or effect type
- Adding or changing **achievement unlock conditions**
- **Renaming or reordering** events that trigger special mechanics, or changing which option index triggers them
- **Adding, removing or reordering events**, if you also need faction interactions to open at the right turn
- Translating text that is hardcoded in the engine

The sections below describe how the data is structured. Use them as reference for editing, and read each note marked **Requires `game.js`**.

### Add a crisis event

> **Limited.** New events run, but several existing event ids and option positions are hardcoded, faction interactions open on fixed turn numbers, and inserting an event shifts those turns. Appending a new event only works safely if you are prepared to check the turn numbers yourself. Editing existing events is the supported path.

Append an object to the array in `data/events.json`. The campaign length follows `events.length`, so the new event adds a turn before the MPR session.

```json
{
  "date": "October 2, 1999",
  "id": "ev_example",
  "title": "Example Crisis",
  "image": "photo/events/24.png",
  "desc": "What is happening, in HTML-friendly text. Use <br><br> for paragraph breaks.",
  "options": [
    {
      "text": "\"What the President says or does.\"",
      "effects": { "PC": 3, "stab": 4, "pop": -2, "pdip": 3, "abri": -2 },
      "reaction": "KOMPAS: 'HEADLINE'<br><br>How the press and factions respond."
    }
  ]
}
```

Effect keys: `PC`, `pop`, `mil`, `ref`, `econ`, `intl`, `stab`, `cendana`, any faction key (its loyalty), and `<faction>_favor` to grant a favor. Many existing events use 4–5 options.

### Add a routine action

> **Requires `game.js`.**

Add an object to `data/actionphase/routine.json`, then **add its `id` to a category in `showRoutineActions()` in `js/game.js`**. Categories are hardcoded, so an action that isn't listed there won't appear.

Common fields: `id`, `short_name`, `description`, `effects`, `alertMsg`, `cooldown` (turns before it can be reused, default 2), plus the optional `conditionalEffects`, `dynamicScaling` and `dynamicPC` blocks (see existing actions for examples).

### Add a decree

> **Requires `game.js`.**

Add an object to `data/actionphase/decrees.json`, then **add its `id` to a category in `showDecreesMenu()` in `js/game.js`**.

Common fields:

| Field | Purpose |
|---|---|
| `id`, `text`, `description`, `alertMsg` | Identity and display text |
| `baseCost` | Political Capital cost, adjusted by difficulty and stability |
| `reqDecree`, `reqStat` / `reqStats` | Prerequisites (`{ "key": "cendana", "val": 60, "op": "<=" }`) |
| `reqFactions` | Faction-loyalty prerequisites: `[{ "key": "pdip", "op": ">=", "val": 80 }]`. A faction that has been banned or merged away is ignored. Needs the engine support for this field. |
| `unlockEvent` | Event id (from `events.json`) from which the decree becomes available. Until that turn the decree is not shown. Needs the engine support for this field. |
| `mutexDecree` / `mutexDecrees` | Decrees that lock this one out |
| `banFactions`, `seatRecipients`, `seatChanges` | Abolish a bloc and redistribute its seats, or change seat counts |
| `locks` | `statPenalties`, `factionPenalties`, `minStats`, `maxCendana`, `minFactions` |

Decrees that change seats or party credentials are locked once the MPR session has convened.

### Add a faction interaction

> **Mostly data-only.** Interactions on the existing ten factions load from JSON. Turn gating uses fixed turn numbers.

Add an entry to the `interactions` array of a file in `data/fraksi/`. Fields used by the engine include `id`, `text`, `description`, `cost`, `effects`, `alertMsg`, `minTurn` / `maxTurn`, `minAffinity`, `minStat`, `reqDecree`, `repeatable` and `mutexGroup`.

### Add an achievement

> **Requires code.** The JSON only defines the display. Unlock conditions are written in code.

Add an entry to `data/achievements.json` with `id`, `title`, `desc` and `icon`, then add the unlock condition in `checkAchievements()` in `js/game.js` or in the result handling in `js/election.js`, and call `unlockAchievement('your_id')`.

### Translate your changes

If you add or edit English text, mirror the change in the matching file under `data/id/` so both languages stay in sync. This is a temporary workflow until the planned localisation-file system replaces it.

## Data field reference

Every JSON file the game reads, with its fields. This reference was written from how the engine reads the data, so a field marked *Optional* is one the code checks before using. If a field you need isn't listed, look at an existing entry in the same file.

> **Reminder:** fields that point at things hardcoded in `js/game.js` (decree and routine action categories, faction keys, achievement conditions, special event ids) are flagged below. See the disclaimer at the top of this guide.

> **How to read the examples.** Every line in the examples has an explanation in a `//` comment above it. **JSON does not allow comments**, so delete every `//` line before you use the code, or the game will fail to load the file. The examples are labelled `jsonc` (JSON with comments) for syntax highlighting.

**Shared value types**

| Type | Meaning |
|---|---|
| **Effects object** | Keys are `PC`, a stat key (`pop`, `mil`, `ref`, `econ`, `intl`, `stab`, `cendana`), a faction key (changes that faction's loyalty) or `<faction>_favor` (grants favors). Values are numbers. Faction interaction effects also accept a range as `[min, max]` or `"min..max"`, which is rolled each time. |
| **Stat key** | `pop`, `mil`, `ref`, `econ`, `intl`, `stab`, `cendana` |
| **Faction key** | `pdip`, `golkar_akbar`, `golkar_habibie`, `poros_tengah`, `abri`, `ppp`, `pkb`, `utusan_daerah`, `utusan_golongan`, `other_parties` |
| **Text** | Plain text or HTML. `<br>`, `<b>`, `<font color="...">` and `<p>` are used throughout the existing files. |

### `data/events.json`

An array of events. Turn order is array order.

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Unique id. **Some ids are hardcoded in `game.js`**, so do not rename existing ones. |
| `date` | string | Yes | Date shown in the dashboard and taskbar, for example `"June 14, 1999"`. |
| `title` | string | Yes | Event headline. |
| `image` | string | Optional | Path to the event image. |
| `desc` | Text | Yes | Event description. |
| `options` | array | Yes | The player's responses. Order matters for some hardcoded events. |

**Event option**

| Field | Type | Required | Description |
|---|---|---|---|
| `text` | Text | Yes | What the player chooses. |
| `effects` | Effects object | Yes | Changes applied when chosen. |
| `reaction` | Text | Yes | Press and faction reaction shown after choosing. |

**Example: an event with two options**

```jsonc
{
  // Unique id for this event. Never reuse an id. Some existing ids are hardcoded in game.js.
  "id": "ev_example",
  // Date shown in the dashboard and taskbar while this turn is active.
  "date": "October 2, 1999",
  // Headline shown at the top of the event.
  "title": "Example Crisis",
  // Image shown with the event (path relative to index.html).
  "image": "photo/events/24.png",
  // Event text. HTML is allowed, and <br><br> makes a paragraph break.
  "desc": "Protesters fill the street outside the palace.<br><br>Your advisors disagree on how to respond.",
  // The player's choices, in the order they appear on screen.
  "options": [
    {
      // Text of the first choice. Quotes inside a JSON string must be escaped as \".
      "text": "\"We will open talks with the student leaders.\"",
      // Effects: spend 2 Political Capital, +4 Popularity, +3 Stability,
      // -2 ABRI loyalty, +2 PDI-P loyalty.
      "effects": { "PC": -2, "pop": 4, "stab": 3, "abri": -2, "pdip": 2 },
      // Press and faction reaction, shown after the player chooses this option.
      "reaction": "KOMPAS: 'PALACE OPENS DOOR TO STUDENTS'<br><br>The generals grumble, but the crowd thins by evening."
    },
    {
      // Text of the second choice.
      "text": "\"Order will be restored. The army is on standby.\"",
      // Effects: +2 Political Capital, -3 Stability, -5 Reformasi Credibility,
      // +4 ABRI loyalty, and one banked favor with the Golkar loyalists (the _favor suffix).
      "effects": { "PC": 2, "stab": -3, "ref": -5, "abri": 4, "golkar_habibie_favor": 1 },
      // Reaction shown for this option.
      "reaction": "TEMPO: 'TROOPS ON THE STREETS AGAIN'<br><br>Calm returns, at a cost to your reform credentials."
    }
  ]
}
```

### `data/config.json`

| Field | Type | Description |
|---|---|---|
| `situationImage`, `habibieCoverImage`, `victoryImage`, `defeatImage` | string | Image paths for the situation screen, the player cover, and the win and loss screens. |
| `routineActionsImage`, `decreesImage` | string | Optional images for the two action cards (defaults to `photo/routine.png` and `photo/decree.png`). |
| `systemModifiers` | object | Shared tuning values (below). Missing values fall back to built-in defaults. |
| `difficultySettings` | object | One entry per difficulty: `easy`, `medium`, `high`, `historical`. |

**`systemModifiers`**

| Field | Default | Description |
|---|---|---|
| `lowStatThreshold` | 40 | Government Stability below this builds up penalties. |
| `highStatThreshold` | 60 | Government Stability at or above this earns bonuses. |
| `malusMultiplier` | 0.45 | How fast penalties build when stability is low. |
| `malusDecayNormal` | 0.5 | How fast penalties fade in the middle range. |
| `malusDecayHigh` | 1.5 | How fast penalties fade when stability is high. |
| `maxGlobalMalus` | 10.0 | Ceiling on accumulated penalties. |
| `bonusMultiplier` | 0.3 | How strongly high stability lifts faction loyalty. |
| `maxBonusDrift` | 2.0 | Ceiling on that loyalty lift per turn. |
| `baseLobbyCost` | 20 | Base lobbying cost reference. |
| `loyalistDrainMitigation` | 0.35 | Cap on how much negative drift Golkar loyalists take per turn. |
| `routineRepeatDecay` | 0.15 | How much a routine action's Political Capital payout falls each time it is reused. |

**Difficulty entry**

| Field | Type | Description |
|---|---|---|
| `name` | string | Display name. |
| `image` | string | Image on the difficulty screen. |
| `description` | Text | Description shown on the difficulty screen. |
| `pc` | number | Starting Political Capital. |
| `statMod` | number | Bonus applied to the starting national stats. |
| `cendana` | number | Starting Cendana Influence. |
| `malusCap` | number | Cap on passive faction drift from penalties (`0` disables it). |
| `actionCostMod` | number | Added to the cost of decrees and faction actions. |
| `passivePCMod` | number | Political Capital gained or lost at the end of each turn. |

**Example: shortened config**

```jsonc
{
  // Image shown on the situation screen.
  "situationImage": "photo/images/situation.png",
  // Image shown on the victory screen.
  "victoryImage": "photo/images/win.png",
  // Image shown on the defeat screen.
  "defeatImage": "photo/images/defeat.png",
  // Shared tuning values. Any value you leave out uses the built-in default.
  "systemModifiers": {
    // Government Stability below this number starts building penalties.
    "lowStatThreshold": 40,
    // Government Stability at or above this number earns bonuses.
    "highStatThreshold": 60,
    // How quickly penalties build when stability is low.
    "malusMultiplier": 0.45,
    // How much a routine action's Political Capital payout drops each time it is reused.
    "routineRepeatDecay": 0.15
  },
  // One entry per difficulty: easy, medium, high, historical.
  "difficultySettings": {
    "medium": {
      // Name shown on the difficulty screen.
      "name": "Medium",
      // Image shown for this difficulty.
      "image": "photo/difficulty/medium.png",
      // Description shown on the difficulty screen. HTML is allowed.
      "description": "A middle ground between what happened and what might have.",
      // Starting Political Capital.
      "pc": 50,
      // Bonus added to the starting national stats.
      "statMod": 5,
      // Starting Cendana Influence (higher is worse for the player).
      "cendana": 60,
      // Cap on passive faction drift from penalties (0 turns it off).
      "malusCap": 0.35,
      // Added to the cost of decrees and faction actions (negative makes them cheaper).
      "actionCostMod": 0,
      // Political Capital gained at the end of each turn (can be negative).
      "passivePCMod": 1
    }
  }
}
```

### `data/stats.json`

An object with one array per stat key (`pop`, `mil`, `ref`, `econ`, `intl`, `stab`, `cendana`). List tiers from highest to lowest `min`. The first tier the value reaches is used.

| Field | Type | Description |
|---|---|---|
| `min` | number | Lowest value (0–100) at which this tier applies. |
| `text` | string | Tier label shown to the player and used in requirement messages. |
| `color` | string | Hex color of the label. |

**Example: the `pop` tiers**

```jsonc
{
  // Tiers for the Popularity stat. Other stats use the same format under their own key.
  "pop": [
    // List tiers from highest to lowest. The first tier the value reaches is used.
    // At 90 or above, show "Tolerated" in dark green.
    { "min": 90, "text": "Tolerated", "color": "#006400" },
    // From 60 to 89, show "Ambivalent" in blue.
    { "min": 60, "text": "Ambivalent", "color": "#4682B4" },
    // From 30 to 59, show "Resented" in orange.
    { "min": 30, "text": "Resented", "color": "#FF8C00" },
    // The last tier should start at 0 so every value has a label.
    { "min": 0,  "text": "Universally Hated", "color": "#8B0000" }
  ]
}
```

### `data/achievements.json`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Id passed to `unlockAchievement()` in code. |
| `title` | Text | Yes | Achievement name. |
| `desc` | Text | Yes | How to earn it. |
| `icon` | string | Yes | Path to the icon. |

The unlock **condition** is not stored here. It is written in `game.js` or `election.js`.

**Example: one achievement**

```jsonc
{
  // Id used by unlockAchievement('...') in the code. The condition itself is not stored here.
  "id": "fumes_in_the_tank",
  // Name shown in the achievements list and the unlock popup.
  "title": "Gliding on Empty",
  // Description of how to earn it.
  "desc": "Enter the MPR General Session with zero Political Capital remaining and win the presidency anyway.",
  // Icon image path.
  "icon": "photo/achv_win_narrow.png"
}
```

### `data/actionphase/routine.json`

An array of routine executive actions. **Requires `game.js`:** each `id` must also be listed in a category in `showRoutineActions()`.

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Unique id. |
| `short_name` | string | Yes | Button title. |
| `description` | Text | Yes | Button description. |
| `effects` | Effects object | Optional | Applied when used. |
| `alertMsg` | Text | Optional | Message shown after use. `{pcGained}` is replaced with the Political Capital gained. |
| `cooldown` | number | Optional | Turns before reuse (default 2). |
| `conditionalEffects` | array | Optional | First matching entry applies (below). |
| `dynamicScaling` | object | Optional | Scales one effect from a stat (below). |
| `alertMsgs` | object | Optional | `success` and `failure` messages used with `dynamicScaling`. |
| `dynamicPC` | object | Optional | Political Capital gain that shrinks with reuse and with penalties (below). |

**`conditionalEffects` entry**

| Field | Type | Description |
|---|---|---|
| `condition.stat` | stat key | Stat to test. |
| `condition.operator` | `">="` or `"<"` | Comparison. |
| `condition.value` | number | Value to compare against. |
| `effects` | Effects object | Applied if the condition is met. |
| `alertMsg` | Text | Replaces the message if the condition is met. |

**`dynamicScaling`**

Result is `max(min, base + floor((stat + scaleOffset) / scaleDivisor))`.

| Field | Description |
|---|---|
| `scaleFrom` | Stat key the result is based on. |
| `scaleOffset`, `scaleDivisor` | Offset added to the stat, and the divisor. |
| `base`, `min` | Base value and the floor. |
| `target` | Effect key that receives the result. |

**`dynamicPC`**

| Field | Description |
|---|---|
| `base` | Base Political Capital gain, reduced by reuse and by current penalties. |
| `min` | Lowest gain. |

**Examples: a conditional action and a scaling action**

```jsonc
[
  {
    // Unique id. Remember to add it to a category in showRoutineActions() in game.js.
    "id": "example_dialogue",
    // Title on the action button.
    "short_name": "Open Dialogue",
    // Description shown on the button.
    "description": "Meet with civil society leaders at the palace.",
    // Turns the action is unavailable after use.
    "cooldown": 3,
    // Always applied: +2 Popularity, +1 Reformasi Credibility.
    "effects": { "pop": 2, "ref": 1 },
    // Message shown after use.
    "alertMsg": "The meeting is cordial and the press reports it fairly.",
    // Extra effects that depend on a stat. The first entry that matches is applied.
    "conditionalEffects": [
      {
        // Matches when National Stability (stab) is below 30.
        "condition": { "stat": "stab", "operator": "<", "value": 30 },
        // Extra effect when matched: -1 Popularity.
        "effects": { "pop": -1 },
        // Replaces the normal message when matched.
        "alertMsg": "With the streets restless, the talks look like weakness."
      }
    ]
  },
  {
    // Unique id.
    "id": "example_roadshow",
    // Button title.
    "short_name": "Investor Roadshow",
    // Button description.
    "description": "Court foreign investors.",
    // Result = max(min, base + floor((stat + scaleOffset) / scaleDivisor)).
    "dynamicScaling": {
      // The stat the result is based on (International Standing).
      "scaleFrom": "intl",
      // Added to the stat before dividing.
      "scaleOffset": 0,
      // The stat is divided by this number.
      "scaleDivisor": 20,
      // Value added to the result.
      "base": 0,
      // Lowest possible result (a failed roadshow can cost Economic Health).
      "min": -1,
      // The effect key that receives the result (Economic Health).
      "target": "econ"
    },
    // Messages used with dynamicScaling: success if the result is above 0, otherwise failure.
    "alertMsgs": {
      "success": "Investors respond warmly.",
      "failure": "Investors are unconvinced."
    },
    // Political Capital gain. It shrinks each time the action is reused and when penalties are active.
    "dynamicPC": {
      // Base gain before reuse and penalty reductions.
      "base": 3,
      // Lowest possible gain.
      "min": 0
    }
  }
]
```

### `data/actionphase/decrees.json`

An array of extraordinary decrees. **Requires `game.js`:** each `id` must also be listed in a category in `showDecreesMenu()`. Decrees that move seats are locked after the Accountability Speech, and a few other ids are locked by a hardcoded list.

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Unique id. Other decrees, interactions and achievements refer to it. |
| `text` | string | Yes | Decree name. |
| `description` | Text | Yes | Description shown on the button. |
| `baseCost` | number | Yes | Political Capital cost before difficulty and stability modifiers (minimum 5). |
| `alertMsg` | Text | Optional | Message shown when enacted. |
| `reqDecree` | string | Optional | Decree that must already be enacted. |
| `reqStat` | object | Optional | One stat requirement (below). |
| `reqStats` | array | Optional | Several stat requirements. |
| `mutexDecree` | string | Optional | A decree that locks this one out. |
| `mutexDecrees` | array | Optional | Several decrees that lock this one out. |
| `banFactions` | array | Optional | Faction keys to abolish. Their seats go to zero. |
| `seatRecipients` | object | Optional | Faction key to weight, for sharing out banned seats. |
| `seatChanges` | object | Optional | Faction key to a fixed seat change. |
| `locks` | object | Optional | Permanent penalties and floors (below). |

**Stat requirement** (`reqStat`, or each item in `reqStats`)

| Field | Description |
|---|---|
| `key` | Stat key. |
| `val` | Threshold. |
| `op` | `">="` (default) or `"<="`. |

**`locks`**

| Field | Description |
|---|---|
| `statPenalties` | Effects object applied once on enactment. |
| `factionPenalties` | Effects object applied once on enactment. |
| `minStats` | Stat key to a permanent minimum. |
| `maxCendana` | Permanent ceiling on Cendana Influence. |
| `minFactions` | Faction key to a permanent minimum loyalty. |

**Examples: a decree with requirements and locks, and a decree that abolishes a faction**

```jsonc
[
  {
    // Unique id. Remember to add it to a category in showDecreesMenu() in game.js.
    "id": "example_commission",
    // Decree name shown on the button.
    "text": "Example Oversight Commission",
    // Description shown on the button.
    "description": "Create an independent body to investigate abuses.",
    // Political Capital cost before difficulty and stability modifiers (minimum 5).
    "baseCost": 25,
    // Message shown when the decree is enacted.
    "alertMsg": "The commission is formally established.",
    // The decree "anti_corruption" must already be enacted.
    "reqDecree": "anti_corruption",
    // Stat requirements, all of which must be met.
    "reqStats": [
      // Reformasi Credibility must be at least 50.
      { "key": "ref", "val": 50, "op": ">=" },
      // Cendana Influence must be 70 or lower.
      { "key": "cendana", "val": 70, "op": "<=" }
    ],
    // This decree is locked out if "example_gag_order" has been enacted.
    "mutexDecrees": ["example_gag_order"],
    // Permanent effects applied when enacted.
    "locks": {
      // One-time stat change: -3 Military Support.
      "statPenalties": { "mil": -3 },
      // One-time faction change: -4 ABRI loyalty.
      "factionPenalties": { "abri": -4 },
      // Reformasi Credibility can never fall below 40 afterwards.
      "minStats": { "ref": 40 },
      // Cendana Influence can never rise above 80 afterwards.
      "maxCendana": 80
    }
  },
  {
    // Unique id.
    "id": "example_ban_party",
    // Decree name.
    "text": "Example Party Ban",
    // Description.
    "description": "Abolish a party caucus and redistribute its seats.",
    // Political Capital cost.
    "baseCost": 40,
    // Message shown when enacted.
    "alertMsg": "The caucus is dissolved and its seats are reassigned.",
    // Factions to abolish. Their seats drop to zero. Locked once the MPR session has convened.
    "banFactions": ["other_parties"],
    // Who receives the freed seats, by weight. Here Golkar loyalists get twice as many as Utusan Golongan.
    "seatRecipients": { "golkar_habibie": 2, "utusan_golongan": 1 }
  }
]
```

### `data/fraksi/<faction_key>.json`

One file per faction. The file name must match the faction key.

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Full name. A `<br>` can be used to control the portrait line break. |
| `short` | string | Yes | Short label used in effect previews and the parliament chart. |
| `seats` | number | Yes | Delegates controlled out of 700. |
| `affinity` | number | Yes | Starting loyalty (0–100). |
| `favor` | number | Optional | Starting banked favors. |
| `image` | string | Yes | Portrait path. |
| `coverImage` | string | Optional | Banner image on the faction screen. |
| `summary` | Text | Yes | Short description. |
| `biography` | Text | Optional | Longer biography. |
| `moods` | array | Yes | Stance tiers (below). |
| `interactions` | array | Yes | Available negotiations (below). |
| `transformed` | object | Optional | Replacement data used when blocs merge (below). |

**Mood entry.** List from highest to lowest `min`.

| Field | Description |
|---|---|
| `min` | Lowest loyalty at which this stance applies. |
| `text` | Stance label. |
| `color` | Hex color of the label. |
| `overlay` | `rgba(...)` color used on the portrait. |

**Interaction**

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Unique id. **An id containing `final` makes it a Final Appeal**, whose turn window is set automatically. |
| `text` | string | Yes | Button title. |
| `description` | Text | Yes | Button description. |
| `cost` | number | Yes | Base Political Capital cost, then modified by difficulty, stability and leverage. |
| `effects` | Effects object | Yes | Applied when used. Supports ranges. |
| `alertMsg` | Text | Optional | Message shown after use. |
| `minTurn`, `maxTurn` | number | Optional | Turns during which it is available. |
| `minAffinity` | number | Optional | Minimum faction loyalty. |
| `minStat` | object | Optional | `{ "key": "...", "val": ... }`. For `cendana`, the stat must be at or **below** `val`. Otherwise it must be at or above. |
| `reqDecree` | string | Optional | Decree that must be enacted. |
| `repeatable` | boolean | Optional | If not true, it can only be used once. |
| `mutexGroup` | string | Optional | Using one entry locks the others that share this group. |
| `locksGroup` | boolean | Optional | Marks the interaction as locking its `mutexGroup`. |

**`transformed`** has the same shape as a faction file, for the fields it overrides: `name`, `seats`, `summary`, `biography`, `moods`, `interactions`.

**Example: an excerpt of a faction file**

```jsonc
{
  // Full name. The <br> controls where the portrait caption breaks.
  "name": "Example Party<br>(Faction)",
  // Short label used in effect previews and the parliament chart.
  "short": "Example",
  // Delegates this faction controls out of 700.
  "seats": 100,
  // Starting loyalty toward the player (0 to 100).
  "affinity": 40,
  // Portrait image.
  "image": "photo/faction/example.png",
  // Banner image on the faction's negotiation screen.
  "coverImage": "photo/faction/example_cover.png",
  // Short description.
  "summary": "A short description of the faction.",
  // Longer biography.
  "biography": "A longer biography.",
  // Stance labels by loyalty. List from highest to lowest min.
  "moods": [
    // At 75 or above: "Allied", green, with a green portrait tint.
    { "min": 75, "text": "Allied", "color": "#006400", "overlay": "rgba(0, 100, 0, 0.25)" },
    // From 40 to 74: "Neutral", gold.
    { "min": 40, "text": "Neutral", "color": "#B8860B", "overlay": "rgba(184, 134, 11, 0.25)" },
    // Below 40: "Hostile", dark red. The last tier should start at 0.
    { "min": 0,  "text": "Hostile", "color": "#8B0000", "overlay": "rgba(139, 0, 0, 0.25)" }
  ],
  // Negotiations the player can start with this faction.
  "interactions": [
    {
      // Unique id.
      "id": "example_private_meeting",
      // Button title.
      "text": "Private Meeting",
      // Button description.
      "description": "Meet the faction leader off the record.",
      // Base Political Capital cost (modified by difficulty, stability and leverage).
      "cost": 10,
      // Effects. A value like [2, 5] is rolled between 2 and 5 each time. Here: +2 to +5 loyalty, -1 Popularity.
      "effects": { "example_faction": [2, 5], "pop": -1 },
      // Message shown after use.
      "alertMsg": "The meeting goes better than expected.",
      // First turn it is available.
      "minTurn": 3,
      // Last turn it is available.
      "maxTurn": 15,
      // It can be used again and again. Without this, it can only be used once.
      "repeatable": true
    },
    {
      // Unique id.
      "id": "example_choose_side",
      // Button title.
      "text": "Back Their Platform",
      // Button description.
      "description": "Publicly endorse the faction's agenda.",
      // Base Political Capital cost.
      "cost": 20,
      // Effects: +8 loyalty and one banked favor with this faction.
      "effects": { "example_faction": 8, "example_faction_favor": 1 },
      // Needs at least 40 loyalty.
      "minAffinity": 40,
      // Needs Cendana Influence at 60 or LOWER (for cendana only, the check is reversed).
      "minStat": { "key": "cendana", "val": 60 },
      // Needs the decree "anti_corruption" to be enacted.
      "reqDecree": "anti_corruption",
      // Interactions that share a group are mutually exclusive.
      "mutexGroup": "example_choice",
      // Using this one locks the rest of its group.
      "locksGroup": true
    },
    {
      // An id containing "final" makes this a Final Appeal. Its turn window is set automatically.
      "id": "example_final_appeal",
      // Button title.
      "text": "Final Appeal",
      // Button description.
      "description": "A last appeal before the vote.",
      // Base Political Capital cost.
      "cost": 15,
      // Effects: +6 loyalty.
      "effects": { "example_faction": 6 }
    }
  ]
}
```

### `data/localization/library.json`

An array of Library entries.

| Field | Type | Required | Description |
|---|---|---|---|
| `term` | string | Yes | Entry title. |
| `subtitle` | string | Optional | Line under the title. |
| `desc` | Text | Yes | Entry body. |
| `category` | string | Yes | One of `Persons`, `Institutions`, `Laws & Decrees`, `Parties & Factions`, `Military & Security`, `Economy & KKN`, `Society & Movements`, `Political Terms`. |
| `image` | string | Optional | Portrait path. Entries in `Persons` always show a portrait frame. |

**Example: two entries**

```jsonc
[
  {
    // Entry title.
    "term": "BLBI",
    // Line shown under the title.
    "subtitle": "Bantuan Likuiditas Bank Indonesia",
    // Category tab. Must be one of the eight Library categories.
    "category": "Economy & KKN",
    // Entry body.
    "desc": "Emergency liquidity loans issued to banks during the 1997–1998 crisis."
  },
  {
    // Entries in the "Persons" category always show a portrait frame.
    "term": "Example Person (1950–)",
    // Role or title.
    "subtitle": "Example role",
    // Category.
    "category": "Persons",
    // Portrait image. If the file is missing, the frame shows the name instead.
    "image": "photo/persons/example.png",
    // Biography.
    "desc": "A short biography."
  }
]
```

### `data/localization/history.json` and `tutorial.json`

An array of pages. Each page is either a plain string or an object.

| Field | Type | Description |
|---|---|---|
| `text` | Text | Page body. |
| `title` | string | Optional page or chapter title (default `Chapter N` or `Topic N`). |
| `image` | string | Optional page image. |

**Example: both page formats**

```jsonc
[
  // Format 1: a plain string. The page is titled "Chapter N" or "Topic N" automatically.
  "A page can be a plain string.",
  {
    // Format 2: an object. Title shown in the page list.
    "title": "Chapter One",
    // Optional image for the page.
    "image": "photo/history/1.png",
    // Page body.
    "text": "Or an object with a title, an image and text."
  }
]
```

### Other files

| File | Structure |
|---|---|
| `data/credits.json` | `main`: array of credit lines (Text). Other lists feed the sub-credit screens. |
| `data/updates.json` | Array (newest first) of `{ "version", "date", "title", "notes": [...] }`. A single object also works. |
| `data/loading.json` | `messages`: `{ "en": [...], "id": [...] }` of loading-screen lines. `files`: list of file names shown while loading. |
| `data/audio/music.json` | Array of `{ "title", "file" }`. The first track is the default. |
| `data/localization/persons.json` | Array loaded at startup for person data. Check an existing entry before editing. |

**Examples**

`data/updates.json`

```jsonc
[
  {
    // Version number shown in the "What's New" panel.
    "version": "0.2",
    // Release date or year.
    "date": "2026",
    // Heading for this update.
    "title": "Release title",
    // Bullet points, one string per line. Newest update goes first in the array.
    "notes": ["First change", "Second change"]
  }
]
```

`data/loading.json`

```jsonc
{
  // Flavor lines shown on the loading screen, one list per language.
  "messages": {
    // English lines (a random few are picked each time).
    "en": ["Drafting the President's Accountability Speech..."],
    // Indonesian lines, used when the language is set to Indonesian.
    "id": ["Menyusun Pidato Pertanggungjawaban Presiden..."]
  },
  // File names shown as "Loading: ..." while the bar fills. They are cosmetic.
  "files": ["config.json", "events.json", "fraksi/pdip.json"]
}
```

`data/audio/music.json`

```jsonc
[
  // One object per track. The first track is the default.
  // "title" is the name in the music player, "file" is the audio path.
  { "title": "Track Name", "file": "audio/track1.mp3" }
]
```

`data/credits.json`

```jsonc
{
  // Lines shown on the main Credits screen. HTML is allowed.
  "main": ["Created by Example", "Historical research: Example"]
}
```