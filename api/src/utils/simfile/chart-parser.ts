/**
 * Chart parsing utilities for extracting note data and counts from simfile chart data
 */

export enum NoteType {
  TAP = '1',
  HOLD_HEAD = '2',
  TAIL = '3',
  ROLL_HEAD = '4',
  ATTACK = 'A',
  FAKE = 'F',
  KEYSOUND = 'K',
  LIFT = 'L',
  MINE = 'M',
}

export interface Note {
  beat: number;
  column: number;
  noteType: NoteType;
  player?: number;
  keysoundIndex?: number;
}

export interface ChartCounts {
  taps: number;
  holds: number;
  rolls: number;
  mines: number;
  lifts: number;
  totalNotes: number; // taps + holds + rolls + lifts (not mines)
}

/**
 * Parse note data string into individual notes
 */
export function parseNotes(noteData: string): Note[] {
  const notes: Note[] = [];

  // Split by & for routine charts (multiple players)
  const playerSections = noteData.split('&');

  playerSections.forEach((playerData, playerIndex) => {
    // Split by commas to get measures
    const measures = playerData.split(',');

    measures.forEach((measure, measureIndex) => {
      const lines = measure
        .trim()
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      if (lines.length === 0) return;

      const subdivision = lines.length;

      lines.forEach((line, lineIndex) => {
        // Remove keysound indices [n] for now - we can add support later if needed
        const cleanLine = line.replace(/\[[^\]]*\]/g, '');

        cleanLine.split('').forEach((char, columnIndex) => {
          if (char !== '0' && Object.values(NoteType).includes(char as NoteType)) {
            notes.push({
              beat: measureIndex * 4 + (lineIndex * 4) / subdivision,
              column: columnIndex,
              noteType: char as NoteType,
              player: playerIndex,
            });
          }
        });
      });
    });
  });

  // Sort notes by beat, then by column
  notes.sort((a, b) => {
    if (a.beat !== b.beat) return a.beat - b.beat;
    return a.column - b.column;
  });

  return notes;
}

/**
 * Count different types of notes in the chart
 */
export function countNotes(notes: Note[]): ChartCounts {
  let holds = 0;
  let rolls = 0;
  let mines = 0;
  let lifts = 0;

  // Track holds and rolls by pairing heads with tails
  const holdHeads = new Map<string, Note>(); // key: `${beat}-${column}`
  const rollHeads = new Map<string, Note>();
  const tapBeats = new Set<string>();

  const beatKey = (note: Note): string => {
    const player = note.player ?? 0;
    const scaledBeat = Math.round(note.beat * 192); // StepMania quantizes to 192nd notes
    return `${player}:${scaledBeat}`;
  };

  for (const note of notes) {
    const key = `${note.beat}-${note.column}`;

    switch (note.noteType) {
      case NoteType.TAP:
        tapBeats.add(beatKey(note));
        break;

      case NoteType.HOLD_HEAD:
        tapBeats.add(beatKey(note));
        holdHeads.set(key, note);
        break;

      case NoteType.ROLL_HEAD:
        tapBeats.add(beatKey(note));
        rollHeads.set(key, note);
        break;

      case NoteType.TAIL:
        // Try to match with a hold or roll head
        // We need to find the most recent head in the same column
        /* eslint-disable no-case-declarations */
        let foundHold = false;

        // Look for holds first
        for (const [headKey, headNote] of holdHeads.entries()) {
          if (headNote.column === note.column && headNote.beat < note.beat) {
            holds++;
            holdHeads.delete(headKey);
            foundHold = true;
            break;
          }
        }

        // If no hold found, look for rolls
        if (!foundHold) {
          for (const [headKey, headNote] of rollHeads.entries()) {
            if (headNote.column === note.column && headNote.beat < note.beat) {
              rolls++;
              rollHeads.delete(headKey);
              break;
            }
          }
        }
        break;

      case NoteType.MINE:
        mines++;
        break;

      case NoteType.LIFT:
        tapBeats.add(beatKey(note));
        lifts++;
        break;

      // Ignore other note types for counting purposes
      case NoteType.ATTACK:
      case NoteType.FAKE:
      case NoteType.KEYSOUND:
      default:
        break;
    }
  }

  // Count any orphaned holds/rolls as single notes
  holds += holdHeads.size;
  rolls += rollHeads.size;

  const taps = tapBeats.size;
  const totalNotes = taps + holds + rolls + lifts;

  return {
    taps,
    holds,
    rolls,
    mines,
    lifts,
    totalNotes,
  };
}

/**
 * Parse chart note data and return counts
 */
export function parseChartCounts(noteData: string): ChartCounts {
  const notes = parseNotes(noteData);
  return countNotes(notes);
}

/**
 * Calculate maximum possible score for a given number of notes up to a specific beat
 * This is used for failed plays where we want to know the max score up to the failure point
 */
export function calculateMaxScoreUpToBeat(noteData: string, maxBeat: number, tapWeight: number, holdWeight: number): { maxScore: number; actualNotes: number } {
  const allNotes = parseNotes(noteData);

  // Filter notes up to the failure beat
  const notesUpToBeat = allNotes.filter((note) => note.beat <= maxBeat);
  const counts = countNotes(notesUpToBeat);

  // Calculate max score based on note types and weights
  const maxScore = (counts.taps + counts.lifts) * tapWeight + (counts.holds + counts.rolls) * holdWeight;

  return {
    maxScore,
    actualNotes: counts.totalNotes,
  };
}
