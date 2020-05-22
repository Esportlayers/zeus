const fakeCommands = [
    {active: true, type: 'betting_user', command: '!a', message: 'a response'},
    {active: false, type: 'betting_user', command: '!b', message: 'b response'},
    {active: true, type: 'betting_streamer', command: '!c', message: 'c response'},
    {active: true, type: 'betting_streamer', command: '!e', message: 'e response', identifier: 'startbet'},
    {active: true, type: 'betting_streamer', command: '!f', message: 'f response', identifier: 'bet'},
    {active: true, type: 'betting_streamer', command: '!g', message: 'g response', identifier: 'betwinner'},
    {active: true, type: 'default', command: '!d', message: 'd response'},
];

const fakeToplist = [
    {name: 'a', won: 4, total: 4},
    {name: 'b', won: 3, total: 4},
    {name: 'c', won: 3, total: 3},
]

jest.mock('../../../src/services/entity/Command', () => ({
    getUserCommands: jest.fn(async () => fakeCommands)
}));

jest.mock('../../../src/services/entity/BetSeasons', () => ({
    getUserSeasonStats: jest.fn(async () => ({won: 4, total: 6})),
    seasonTopList: jest.fn(async () => fakeToplist),
}));

jest.mock('../../../src/services/entity/BetRound', () => ({
    createBetRound: jest.fn(),
    createBet: jest.fn(),
    getRoundId: jest.fn(async () => 1),
    patchBetRound: jest.fn(),
}));

jest.mock('../../../src/services/websocket', () => ({
    sendMessage: jest.fn(),
}));

process.env.SENTRY_DSN = '';

import {
    requireUserCommands,
    clearBettingCommandsCache, 
    replaceBetPlaceholder, 
    handleStaticCommands, 
    getBettingCommands,
    handleUserBet
} from '../../../src/services/betting/chatCommands';
import {getUserCommands} from '../../../src/services/entity/Command';
import { User } from '../../../src/@types/Entities/User';
import { ChatUserstate } from 'tmi.js';
import { CurrentBetRound } from '../../../src/services/betting/state';
const fakeChannel = '#test';

describe('requireUserCommands', () => {
    test('test first call without store', async () => {
        const commands = await requireUserCommands(fakeChannel , 1);
        expect(getUserCommands).toHaveBeenCalledTimes(1);
        expect(getUserCommands).toHaveBeenCalledWith(1);
        expect(commands).toMatchSnapshot();
    });

    test('test second call with store', async () => {
        (getUserCommands as jest.Mock).mockClear();
        const commands = await requireUserCommands(fakeChannel , 1);
        expect(getUserCommands).toHaveBeenCalledTimes(0);
        expect(commands).toMatchSnapshot();
    });

    test('clear of store', async () => {
        (getUserCommands as jest.Mock).mockClear();
        clearBettingCommandsCache(fakeChannel + '1');
        expect(getUserCommands).toHaveBeenCalledTimes(0);
        clearBettingCommandsCache(fakeChannel);
        expect(getUserCommands).toHaveBeenCalledTimes(0);

        const commands = await requireUserCommands(fakeChannel , 1);
        expect(commands).toMatchSnapshot();
    })
})

describe('replaceBetPlaceholder', () => {
    test('{USER}', async () => {
        const replaced = await replaceBetPlaceholder('Hallo {USER}', 'GriefCode', 1);
        expect(replaced).toEqual('Hallo GriefCode');
    })
    test('{TOPLIST_STATS}', async () => {
        const replaced = await replaceBetPlaceholder('Toplist {TOPLIST_STATS}', 'GriefCode', 1);
        expect(replaced).toEqual('Toplist 1. a (4/4)  2. b (3/4)  3. c (3/3)');
    })
    test('{USER_BETS_CORRECT}', async () => {
        const replaced = await replaceBetPlaceholder('Correct {USER_BETS_CORRECT}', 'GriefCode', 1);
        expect(replaced).toEqual('Correct 4');
    })
    test('{USER_BETS_WRONG}', async () => {
        const replaced = await replaceBetPlaceholder('Wrong {USER_BETS_WRONG}', 'GriefCode', 1);
        expect(replaced).toEqual('Wrong 2');
    })
    test('{USER_BETS_TOTAL}', async () => {
        const replaced = await replaceBetPlaceholder('Total {USER_BETS_TOTAL}', 'GriefCode', 1);
        expect(replaced).toEqual('Total 6');
    })
    test('{USER_BETS_ACCURACY}', async () => {
        const replaced = await replaceBetPlaceholder('Accuracy {USER_BETS_ACCURACY}', 'GriefCode', 1);
        expect(replaced).toEqual('Accuracy 66%');
    })
});

describe('handleStaticCommands', () => {
    const fakeUser =  {id: 1, betSeasonId: 1} as unknown as User;
    test('static non betting command', async () => {
        const res = await handleStaticCommands(fakeChannel, '!d', fakeUser, 'GriefCode');
        expect(res).toBeFalsy();
    });
    test('static betting command', async () => {
        const res = await handleStaticCommands(fakeChannel, '!a', fakeUser, 'GriefCode');
        expect(res).toBeTruthy();
    });
    test('static betting non active command', async () => {
        const res = await handleStaticCommands(fakeChannel, '!b', fakeUser, 'GriefCode');
        expect(res).toBeFalsy();
    });
})

describe('getBettingCommands', () => {
    test('recv', async () => {
        const commands = await getBettingCommands(1, fakeChannel);
        expect(commands).toMatchSnapshot();
    })
})

const fakeTags = {
    'user-id': 123,
    'display-name': 'GriefCode',
    'username': 'griefcode'
} as unknown as ChatUserstate;

describe('handleUserBet', () => {
    const getFakeRound = () => ({
        bets: 4,
        aBets: 2,
        bBets: 2,
        betters: ['a', 'b', 'c', 'd']
    } as unknown as CurrentBetRound);
    
    test('bet a', async () => {
        const fakeRound = getFakeRound();
        const {bet} = await getBettingCommands(1, fakeChannel);
        await handleUserBet('!f a', bet, fakeTags, fakeRound, 1)
        expect(fakeRound.aBets).toEqual(3);
        expect(fakeRound.bets).toEqual(5);
        expect(fakeRound.betters.includes('griefcode')).toBeTruthy();
    })
    test('bet b', async () => {
        const fakeRound = getFakeRound();
        const {bet} = await getBettingCommands(1, fakeChannel);
        await handleUserBet('!f b', bet, fakeTags, fakeRound, 1)
        expect(fakeRound.bBets).toEqual(3);
        expect(fakeRound.bets).toEqual(5);
        expect(fakeRound.betters.includes('griefcode')).toBeTruthy();
    })
    test('invlaid bet', async () => {
        const fakeRound = getFakeRound();
        const {bet} = await getBettingCommands(1, fakeChannel);
        await handleUserBet('!f c', bet, fakeTags, fakeRound, 1)
        expect(fakeRound.aBets).toEqual(2);
        expect(fakeRound.bBets).toEqual(2);
        expect(fakeRound.bets).toEqual(4);
        expect(fakeRound.betters.includes('griefcode')).toBeFalsy();
    })
})