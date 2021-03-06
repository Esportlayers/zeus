import { Request, Response, Router } from "express";
import {
  clearUserStats,
  loadStats,
  loadSteamConnections,
  loadUserById,
  patchUser,
  removeDotaGames,
  removeUser,
} from "../../services/entity/User";

import { User } from "@streamdota/shared-types";
import { checkUserFrameAPIKey } from "../../middleware/frameApi";
import dayjs from "dayjs";
import { requireAuthorization } from "../../middleware/requireAuthorization";
import { sendMessage } from "../../services/websocket";

const route = Router();

export default (app: Router) => {
  app.use("/user", route);

  route.get(
    "/baseData",
    checkUserFrameAPIKey,
    requireAuthorization,
    (req: Request, res: Response) => {
      return res.json(req.user).status(200);
    }
  );

  route.patch(
    "/baseData",
    requireAuthorization,
    async (req: Request, res: Response) => {
      await patchUser((req.user as User).id, req.body);
      const user = await loadUserById((req.user as User).id);
      return res.json(user).status(200);
    }
  );

  route.get(
    "/steam",
    requireAuthorization,
    async (req: Request, res: Response) => {
      const connections = await loadSteamConnections((req.user as User).id);
      return res.json(connections).status(200);
    }
  );

  route.get(
    "/dotaStats",
    checkUserFrameAPIKey,
    requireAuthorization,
    async (req: Request, res: Response) => {
      const user = req.user as User;
      const stats = await loadStats(user.id, user.dotaStatsFrom);
      return res.json(stats).status(200);
    }
  );

  route.delete(
    "/dotaStats/:ts",
    requireAuthorization,
    async (req: Request, res: Response) => {
      const user = req.user as User;
      await removeDotaGames(user.id, +req.params.ts);
      sendMessage(user.id, "dota_wl_reset", {});
      return res.sendStatus(204);
    }
  );

  route.delete(
    "/dotaStats",
    requireAuthorization,
    async (req: Request, res: Response) => {
      const user = req.user as User;
      await clearUserStats(user.id, dayjs().unix());
      sendMessage(user.id, "dota_wl_reset", {});
      return res.sendStatus(204);
    }
  );

  route.delete(
    "/deleteAccount",
    requireAuthorization,
    async (req: Request, res: Response) => {
      const user = req.user as User;
      await removeUser(user.id);
      return res.sendStatus(204);
    }
  );
};
