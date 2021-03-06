import { BetRound, BetRoundStats, User } from "@streamdota/shared-types";

import { RowDataPacket } from "mysql2";
import { fetchChatterCount } from "../twitchApi";
import { getBettingCommands } from "../betting/chatCommands";
import { getConn } from "../../loader/db";
import { loadUserById } from "./User";
import { publish } from "../twitchChat";
import { requireWatcher } from "./Watcher";
import { resetRound } from "../betting/state";

async function getRound(userId: number): Promise<number> {
  const user = await loadUserById(userId);
  if (user && user.betSeasonId) {
    const conn = await getConn();
    const [roundRows] = await conn.execute<
      Array<{ round: number } & RowDataPacket>
    >(
      "SELECT round FROM bet_rounds WHERE bet_season_id = ? ORDER BY round DESC LIMIT 1",
      [user.betSeasonId]
    );
    await conn.end();

    return roundRows.length > 0 ? roundRows[0].round : 0;
  }

  return 0;
}

export async function getRoundId(userId: number): Promise<number> {
  const user = await loadUserById(userId);
  if (user && user.betSeasonId) {
    const conn = await getConn();
    const [roundRows] = await conn.execute<
      Array<{ id: number } & RowDataPacket>
    >(
      "SELECT id FROM bet_rounds WHERE bet_season_id = ? AND user_id = ? ORDER BY round DESC LIMIT 1",
      [user.betSeasonId, userId]
    );
    await conn.end();

    return roundRows.length > 0 ? roundRows[0].id : 0;
  }

  return 0;
}

interface DecoratedBetRound extends BetRound {
  created: number;
  total: number;
  aBets: string;
  bBets: string;
}

export async function getRoundById(
  roundId: number
): Promise<DecoratedBetRound | null> {
  const conn = await getConn();
  const [rows] = await conn.execute<Array<DecoratedBetRound & RowDataPacket>>(
    `
        SELECT br.id, 
               br.bet_season_id as betSeason, 
               br.round, 
               br.status, 
               br.result,
               br.chatters as chatters,
               UNIX_TIMESTAMP(br.created) as created,
               COUNT(b.id) as total,
               SUM(IF(b.bet = u.team_a_name, 1, 0)) as aBets,
               SUM(IF(b.bet = u.team_b_name, 1, 0)) as bBets
        FROM bet_rounds br
  INNER JOIN user u ON u.id = br.user_id
   LEFT JOIN bets b ON b.bet_round_id = br.id
       WHERE br.id = ? 
    GROUP BY br.id`,
    [roundId]
  );
  await conn.end();

  return rows.length > 0 ? rows[0] : null;
}

export async function getBetSeasonRounds(
  seasonId: number
): Promise<BetRoundStats[]> {
  const conn = await getConn();
  const [rows] = await conn.execute<Array<BetRoundStats & RowDataPacket>>(
    `
        SELECT 
            br.id, 
            br.round, 
            br.status, 
            br.result, 
            br.user_id as userId,
            br.chatters as chatters,
            u.display_name as displayName,
            UNIX_TIMESTAMP(br.created) as created,
            COUNT(b.id) as total,
            SUM(IF(b.bet = u.team_a_name, 1, 0)) as aBets,
            SUM(IF(b.bet = u.team_b_name, 1, 0)) as bBets,
            br.bet_season_id as betSeason
       FROM bet_rounds br
  LEFT JOIN bets b ON b.bet_round_id = br.id
 INNER JOIN user u ON u.id = br.user_id
      WHERE br.bet_season_id = ?
   GROUP BY br.id
   ORDER BY br.created DESC
`,
    [seasonId]
  );
  await conn.end();

  return rows;
}

export async function createBetRound(
  userId: number,
  seasonId: number | null
): Promise<void> {
  if (seasonId) {
    const conn = await getConn();
    const round = (await getRound(userId)) + 1;
    const { displayName } = (await loadUserById(userId))!;
    const chatters = await fetchChatterCount(displayName);

    await conn.execute(
      'INSERT INTO bet_rounds (id, bet_season_id, user_id, round, created, status, result, chatters) VALUES (NULL, ?, ?, ?, NOW(), ?, "", ?)',
      [seasonId, userId, round, "betting", chatters]
    );
    await conn.end();
  }
}

interface PatchableData {
  status: "betting" | "running" | "finished";
  result: string;
}

export async function patchBetRound(
  roundId: number,
  data: Partial<PatchableData>,
  user?: User
): Promise<void> {
  const conn = await getConn();

  if (data.result) {
    await conn.execute("UPDATE bet_rounds SET result=? WHERE id=?", [
      data.result,
      roundId,
    ]);
  }

  if (data.status) {
    await conn.execute("UPDATE bet_rounds SET status=? WHERE id=?", [
      data.status,
      roundId,
    ]);
  }

  if (user && data.status === "finished" && data.result) {
    const channel = "#" + user.displayName.toLowerCase();
    await resetRound(channel, user.id);
    const { winner: winnerCommand } = await getBettingCommands(channel);
    await publish(
      channel,
      winnerCommand.message.replace(/\{WINNER\}/g, data.result)
    );
  }

  await conn.end();
}

export async function deleteBetRound(roundId: number): Promise<void> {
  const conn = await getConn();
  await conn.execute("DELETE FROM bets WHERE bet_round_id=?", [roundId]);
  await conn.execute("DELETE FROM bet_rounds WHERE id=?", [roundId]);
  await conn.end();
}

export async function createBet(
  userId: number,
  twitchId: number,
  displayName: string,
  username: string,
  bet: string
): Promise<void> {
  const conn = await getConn();
  const watcher = await requireWatcher(twitchId, displayName, username, userId);
  const betRound = await getRoundId(userId);

  await conn.execute(
    "INSERT INTO bets (id, watcher_id, bet_round_id, created, bet) VALUES (NULL, ?, ?, NOW(), ?)",
    [watcher.id, betRound, bet]
  );
  await conn.end();
}
