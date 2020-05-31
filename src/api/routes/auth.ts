import { Router, Request, Response } from 'express';
import {PassportStatic} from 'passport';
import jsonwebtoken from 'jsonwebtoken';
import config from '../../config';
import { User } from '../../@types/Entities/User';

const route = Router();

export default (app: Router, passport: PassportStatic) => {
    app.use('/auth', route);
    route.get("/twitch", passport.authenticate("twitch"));
    route.get("/twitch/callback", passport.authenticate("twitch", { failureRedirect: "/auth/twitch" }), (req: Request, res: Response) => {
        const user = req.user as User;
        const jwtToken = jsonwebtoken.sign({sub: user.id, name: user.displayName}, config.jwtSecret);
        return res.send(jwtToken).status(200);
    });
};
