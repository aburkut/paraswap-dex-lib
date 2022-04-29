import dotenv from 'dotenv';
dotenv.config();

import { Interface } from '@ethersproject/abi';
import { BalancerV2 } from './balancer-v2';
import { DummyDexHelper } from '../../dex-helper';
import { Tokens, Holders } from '../../../tests/constants-e2e';
import { Network, SwapSide, ProviderURL, MAX_INT } from '../../constants';
import { OptimizedBalancerV2Data, SwapTypes, BalancerV2Data } from './types';
import { JsonRpcProvider } from '@ethersproject/providers';
import VaultABI from '../../abi/balancer-v2/vault.json';
import { Contract } from '@ethersproject/contracts';
import { ExchangePrices, Token } from '../../types';
import { VirtualBoostedPool, VirtualBoostedPools } from './VirtualBoostedPool';

jest.setTimeout(50 * 1000);

const network = Network.MAINNET;
const vaultAddress = '0xBA12222222228d8Ba445958a75a0704d566BF2C8';
const tokens = Tokens[Network.MAINNET];
const holders = Holders[Network.MAINNET];
let vaultContract: Contract;
let balancer: BalancerV2;
let blocknumber: number;
let virtualBoostedPools: VirtualBoostedPools;

// bbausd is an existing boostedPool
const bbausdId =
  '0x7b50775383d3d6f0215a8f290f2c9e2eebbeceb20000000000000000000000fe';
const bbausdAddr = '0x7b50775383d3d6f0215a8f290f2c9e2eebbeceb2';
const bbausdBoostedPools = [
  {
    id: '0x7b50775383d3d6f0215a8f290f2c9e2eebbeceb20000000000000000000000fe',
    address: '0x7b50775383d3d6f0215a8f290f2c9e2eebbeceb2',
    poolType: 'StablePhantom',
    tokens: [
      {
        address: '0x2bbf681cc4eb09218bee85ea2a5d3d13fa40fc0c',
        decimals: 18,
      },
      {
        address: '0x7b50775383d3d6f0215a8f290f2c9e2eebbeceb2',
        decimals: 18,
      },
      {
        address: '0x804cdb9116a10bb78768d3252355a1b18067bf8f',
        decimals: 18,
      },
      {
        address: '0x9210f1204b5a24742eba12f710636d76240df3d0',
        decimals: 18,
      },
    ],
    mainIndex: 0,
    wrappedIndex: 0,
  },
  {
    id: '0x9210f1204b5a24742eba12f710636d76240df3d00000000000000000000000fc',
    address: '0x9210f1204b5a24742eba12f710636d76240df3d0',
    poolType: 'AaveLinear',
    tokens: [
      {
        address: '0x9210f1204b5a24742eba12f710636d76240df3d0',
        decimals: 18,
      },
      {
        address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        decimals: 6,
      },
      {
        address: '0xd093fa4fb80d09bb30817fdcd442d4d02ed3e5de',
        decimals: 6,
      },
    ],
    mainIndex: 1,
    wrappedIndex: 2,
  },
  {
    id: '0x804cdb9116a10bb78768d3252355a1b18067bf8f0000000000000000000000fb',
    address: '0x804cdb9116a10bb78768d3252355a1b18067bf8f',
    poolType: 'AaveLinear',
    tokens: [
      {
        address: '0x02d60b84491589974263d922d9cc7a3152618ef6',
        decimals: 18,
      },
      {
        address: '0x6b175474e89094c44da98b954eedeac495271d0f',
        decimals: 18,
      },
      {
        address: '0x804cdb9116a10bb78768d3252355a1b18067bf8f',
        decimals: 18,
      },
    ],
    mainIndex: 1,
    wrappedIndex: 0,
  },
  {
    id: '0x2bbf681cc4eb09218bee85ea2a5d3d13fa40fc0c0000000000000000000000fd',
    address: '0x2bbf681cc4eb09218bee85ea2a5d3d13fa40fc0c',
    poolType: 'AaveLinear',
    tokens: [
      {
        address: '0x2bbf681cc4eb09218bee85ea2a5d3d13fa40fc0c',
        decimals: 18,
      },
      {
        address: '0xdac17f958d2ee523a2206206994597c13d831ec7',
        decimals: 6,
      },
      {
        address: '0xf8fd466f12e236f4c96f7cce6c79eadb819abf58',
        decimals: 6,
      },
    ],
    mainIndex: 1,
    wrappedIndex: 2,
  },
];

async function getPrices(
  balancer: BalancerV2,
  blocknumber: number,
  from: Token,
  to: Token,
  amounts: bigint[],
): Promise<null | ExchangePrices<BalancerV2Data>> {
  const pools = await balancer.getPoolIdentifiers(
    from,
    to,
    SwapSide.SELL,
    blocknumber,
  );
  const prices = await balancer.getPricesVolume(
    from,
    to,
    amounts,
    SwapSide.SELL,
    blocknumber,
    pools,
  );
  return prices;
}

describe('VirtualBoostedPools', () => {
  beforeAll(async () => {
    const provider = new JsonRpcProvider(ProviderURL[network]);
    vaultContract = new Contract(vaultAddress, VaultABI, provider);
    const dexHelper = new DummyDexHelper(Network.MAINNET);
    blocknumber = await dexHelper.provider.getBlockNumber();
    balancer = new BalancerV2(Network.MAINNET, 'BalancerV2', dexHelper);
    await balancer.setupEventPools(blocknumber);
    // Create virtual boosted pool info using bbausd subgraph data
    virtualBoostedPools = VirtualBoostedPool.createPools(bbausdBoostedPools);
  });

  describe('helpers', () => {
    it('createVirtualBoostedPools, dictionary pools', () => {
      const bbausd = virtualBoostedPools.dictionary[bbausdId];
      expect(bbausd).not.toBeNull();
      expect(bbausd.mainTokens.length).toBe(3);
      expect(bbausd.mainTokens[0].address).toBe(tokens['USDT'].address);
      expect(bbausd.mainTokens[0].decimals).toBe(tokens['USDT'].decimals);
      expect(bbausd.mainTokens[0].linearPoolAddr).toBe(
        '0x2bbf681cc4eb09218bee85ea2a5d3d13fa40fc0c',
      );
      expect(bbausd.mainTokens[0].linearPoolId).toBe(
        '0x2bbf681cc4eb09218bee85ea2a5d3d13fa40fc0c0000000000000000000000fd',
      );
      expect(bbausd.mainTokens[1].address).toBe(tokens['DAI'].address);
      expect(bbausd.mainTokens[1].decimals).toBe(tokens['DAI'].decimals);
      expect(bbausd.mainTokens[1].linearPoolAddr).toBe(
        '0x804cdb9116a10bb78768d3252355a1b18067bf8f',
      );
      expect(bbausd.mainTokens[1].linearPoolId).toBe(
        '0x804cdb9116a10bb78768d3252355a1b18067bf8f0000000000000000000000fb',
      );
      expect(bbausd.mainTokens[2].address).toBe(tokens['USDC'].address);
      expect(bbausd.mainTokens[2].decimals).toBe(tokens['USDC'].decimals);
      expect(bbausd.mainTokens[2].linearPoolAddr).toBe(
        '0x9210f1204b5a24742eba12f710636d76240df3d0',
      );
      expect(bbausd.mainTokens[2].linearPoolId).toBe(
        '0x9210f1204b5a24742eba12f710636d76240df3d00000000000000000000000fc',
      );
    });

    it('createVirtualBoostedPools, subgraph pools', () => {
      const subgraphPools = virtualBoostedPools.subgraph;
      expect(subgraphPools.length).toBe(1);
      expect(subgraphPools[0].address).toBe(
        bbausdAddr + VirtualBoostedPool.poolType.toLowerCase(),
      );
      expect(subgraphPools[0].id).toBe(
        bbausdId + VirtualBoostedPool.poolType.toLowerCase(),
      );
      expect(subgraphPools[0].poolType).toBe('VirtualBoosted');
      expect(subgraphPools[0].tokens.length).toBe(3);
      expect(subgraphPools[0].tokens[0].address).toBe(tokens['USDT'].address);
      expect(subgraphPools[0].tokens[0].decimals).toBe(tokens['USDT'].decimals);
      expect(subgraphPools[0].tokens[1].address).toBe(tokens['DAI'].address);
      expect(subgraphPools[0].tokens[1].decimals).toBe(tokens['DAI'].decimals);
      expect(subgraphPools[0].tokens[2].address).toBe(tokens['USDC'].address);
      expect(subgraphPools[0].tokens[2].decimals).toBe(tokens['USDC'].decimals);
    });

    it('parsePoolPairData', () => {
      const tokenInAddr = tokens['DAI'].address;
      const tokenOutAddr = tokens['USDC'].address;
      const vaultInterface = new Interface(VaultABI);
      const virtualBoostedPool = new VirtualBoostedPool(
        vaultAddress,
        vaultInterface,
      );
      const poolPairData = virtualBoostedPool.parsePoolPairData(
        virtualBoostedPools.subgraph[0],
        {},
        tokenInAddr,
        tokenOutAddr,
        virtualBoostedPools.dictionary,
      );
      expect(poolPairData.tokenIn).toBe(tokenInAddr);
      expect(poolPairData.tokenOut).toBe(tokenOutAddr);
      expect(poolPairData.phantomPoolId).toBe(bbausdId);
    });

    it('checkBalance', () => {
      const tokenInAddr = tokens['DAI'].address;
      const tokenOutAddr = tokens['USDC'].address;
      const vaultInterface = new Interface(VaultABI);
      const virtualBoostedPool = new VirtualBoostedPool(
        vaultAddress,
        vaultInterface,
      );
      const poolPairData = virtualBoostedPool.parsePoolPairData(
        virtualBoostedPools.subgraph[0],
        {},
        tokenInAddr,
        tokenOutAddr,
        virtualBoostedPools.dictionary,
      );
      const check = virtualBoostedPool.checkBalance(
        [],
        BigInt(0),
        SwapSide.SELL,
        poolPairData,
      );
      expect(check).toBeFalsy();
    });

    it('getSwapData, invalid tokens', () => {
      const tokenInAddr = tokens['WETH'].address;
      const tokenOutAddr = tokens['USDC'].address;
      const amount = '1';
      expect(() =>
        VirtualBoostedPool.getSwapData(
          tokenInAddr,
          tokenOutAddr,
          bbausdId + VirtualBoostedPool.poolType.toLowerCase(),
          amount,
          virtualBoostedPools.dictionary,
        ),
      ).toThrowError('Token missing');
    });

    it('getSwapData, invalid id', () => {
      const tokenInAddr = tokens['DAI'].address;
      const tokenOutAddr = tokens['USDC'].address;
      const amount = '1';
      expect(() =>
        VirtualBoostedPool.getSwapData(
          tokenInAddr,
          tokenOutAddr,
          'wrongid',
          amount,
          virtualBoostedPools.dictionary,
        ),
      ).toThrowError('Invalid VirtualBoostedPool ID');
    });

    it('getSwapData', () => {
      const tokenInAddr = tokens['DAI'].address;
      const tokenOutAddr = tokens['USDC'].address;
      const amount = '1';
      const swapData = VirtualBoostedPool.getSwapData(
        tokenInAddr,
        tokenOutAddr,
        bbausdId + VirtualBoostedPool.poolType.toLowerCase(),
        amount,
        virtualBoostedPools.dictionary,
      );

      expect(swapData.assets).toEqual([
        tokenInAddr,
        '0x804cdb9116a10bb78768d3252355a1b18067bf8f',
        '0x9210f1204b5a24742eba12f710636d76240df3d0',
        tokenOutAddr,
      ]);
      expect(swapData.swaps).toEqual([
        {
          poolId:
            '0x804cdb9116a10bb78768d3252355a1b18067bf8f0000000000000000000000fb',
          assetInIndex: 0,
          assetOutIndex: 1,
          amount: amount,
          userData: '0x',
        },
        {
          poolId:
            '0x7b50775383d3d6f0215a8f290f2c9e2eebbeceb20000000000000000000000fe',
          assetInIndex: 1,
          assetOutIndex: 2,
          amount: '0',
          userData: '0x',
        },
        {
          poolId:
            '0x9210f1204b5a24742eba12f710636d76240df3d00000000000000000000000fc',
          assetInIndex: 2,
          assetOutIndex: 3,
          amount: '0',
          userData: '0x',
        },
      ]);
      expect(swapData.limits).toEqual(Array(4).fill(MAX_INT));
    });
  });

  describe('test pricing vs onchain', () => {
    it('calculated prices should match queryBatchSwap delta', async () => {
      const swapType = SwapTypes.SwapExactIn;
      const from = tokens['DAI'];
      const to = tokens['USDC'];
      const amount = BigInt('1000000000000000000');

      // fetch calculated prices to compare
      const prices = await getPrices(balancer, blocknumber, from, to, [
        BigInt('0'),
        amount,
      ]);
      expect(prices).not.toBeNull();
      if (!prices) return;
      // Get balancers params
      const data: OptimizedBalancerV2Data = {
        swaps: [
          {
            poolId: prices[0].data.poolId,
            amount: amount.toString(),
          },
        ],
      };
      // [swapType, swaps[], assets, funds, limits[], timeout]
      const param = balancer.getBalancerParam(
        from.address,
        to.address,
        amount.toString(),
        prices[0].prices[1].toString(),
        data,
        SwapTypes.SwapExactIn ? SwapSide.SELL : SwapSide.BUY,
      );
      const funds = {
        sender: holders['DAI'],
        recipient: holders['DAI'],
        fromInternalBalance: false,
        toInternalBalance: false,
      };
      // query result onchain
      const deltas = await vaultContract.callStatic.queryBatchSwap(
        swapType,
        param[1],
        param[2],
        funds,
      );
      expect(deltas[1].toString()).toEqual(
        (prices[0].prices[1] * BigInt(-1)).toString(),
      );
    });
  });
});
