use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, Transfer};

declare_id!("8mr7vpqXRnwiHsAs4c8dpLurgMWuoFNDmqFYbepqpqBJ");

/// Reward Rate (CONTEXT.md) is basis points *per year* — used as the
/// denominator when pro-rating a Stake Position's Lock Duration into a Reward.
const SECONDS_PER_YEAR: i64 = 365 * 24 * 60 * 60;

#[program]
pub mod token_vault {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.admin_authority = ctx.accounts.admin_authority.key();
        config.reward_mint = ctx.accounts.reward_mint.key();
        config.reward_mint_bump = ctx.bumps.reward_mint;
        Ok(())
    }

    pub fn create_pool(
        ctx: Context<CreatePool>,
        lock_duration_seconds: i64,
        reward_rate_bps: u64,
        early_withdrawal_penalty_bps: u16,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.config = ctx.accounts.config.key();
        pool.stake_mint = ctx.accounts.stake_mint.key();
        pool.vault = ctx.accounts.vault.key();
        pool.treasury = ctx.accounts.treasury.key();
        pool.lock_duration_seconds = lock_duration_seconds;
        pool.reward_rate_bps = reward_rate_bps;
        pool.early_withdrawal_penalty_bps = early_withdrawal_penalty_bps;
        pool.paused = false;
        pool.bump = ctx.bumps.pool;
        pool.vault_bump = ctx.bumps.vault;
        Ok(())
    }

    pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
        ctx.accounts.pool.paused = paused;
        Ok(())
    }

    pub fn stake(ctx: Context<Stake>, amount: u64, _position_nonce: u64) -> Result<()> {
        require!(amount > 0, TokenVaultError::ZeroAmount);

        let pool = &ctx.accounts.pool;
        let now = Clock::get()?.unix_timestamp;

        let stake_position = &mut ctx.accounts.stake_position;
        stake_position.pool = pool.key();
        stake_position.owner = ctx.accounts.owner.key();
        stake_position.amount = amount;
        stake_position.staked_at = now;
        stake_position.unlocks_at = now + pool.lock_duration_seconds;
        stake_position.bump = ctx.bumps.stake_position;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.owner_token_account.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            amount,
        )?;

        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        let stake_position = &ctx.accounts.stake_position;
        let pool = &ctx.accounts.pool;
        let now = Clock::get()?.unix_timestamp;
        require!(now >= stake_position.unlocks_at, TokenVaultError::StillLocked);

        let amount = stake_position.amount;
        let reward: u64 = ((amount as u128)
            * (pool.reward_rate_bps as u128)
            * (pool.lock_duration_seconds as u128)
            / (10_000u128 * SECONDS_PER_YEAR as u128))
            .try_into()
            .map_err(|_| TokenVaultError::RewardOverflow)?;

        let pool_key = pool.key();
        let vault_seeds: &[&[u8]] = &[b"vault", pool_key.as_ref(), &[pool.vault_bump]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.owner_token_account.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                &[vault_seeds],
            ),
            amount,
        )?;

        let reward_mint_seeds: &[&[u8]] =
            &[b"reward_mint", &[ctx.accounts.config.reward_mint_bump]];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.reward_mint.to_account_info(),
                    to: ctx.accounts.owner_reward_token_account.to_account_info(),
                    authority: ctx.accounts.reward_mint.to_account_info(),
                },
                &[reward_mint_seeds],
            ),
            reward,
        )?;

        Ok(())
    }

    pub fn withdraw_early(_ctx: Context<WithdrawEarly>) -> Result<()> {
        Ok(())
    }
}

#[account]
pub struct Config {
    pub admin_authority: Pubkey,
    pub reward_mint: Pubkey,
    pub reward_mint_bump: u8,
}

#[account]
pub struct Pool {
    pub config: Pubkey,
    pub stake_mint: Pubkey,
    pub vault: Pubkey,
    pub treasury: Pubkey,
    pub lock_duration_seconds: i64,
    pub reward_rate_bps: u64,
    pub early_withdrawal_penalty_bps: u16,
    pub paused: bool,
    pub bump: u8,
    pub vault_bump: u8,
}

#[account]
pub struct StakePosition {
    pub pool: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
    pub staked_at: i64,
    pub unlocks_at: i64,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin_authority: Signer<'info>,
    #[account(
        init,
        payer = admin_authority,
        space = 8 + 32 + 32 + 1,
        seeds = [b"config"],
        bump,
    )]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = admin_authority,
        seeds = [b"reward_mint"],
        bump,
        mint::decimals = 9,
        mint::authority = reward_mint,
    )]
    pub reward_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreatePool<'info> {
    #[account(has_one = admin_authority)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub admin_authority: Signer<'info>,
    #[account(
        init,
        payer = admin_authority,
        space = 8 + 32 + 32 + 32 + 32 + 8 + 8 + 2 + 1 + 1 + 1,
        seeds = [b"pool", stake_mint.key().as_ref()],
        bump,
    )]
    pub pool: Account<'info, Pool>,
    pub stake_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = admin_authority,
        seeds = [b"vault", pool.key().as_ref()],
        bump,
        token::mint = stake_mint,
        token::authority = vault,
    )]
    pub vault: Account<'info, TokenAccount>,
    /// CHECK: treasury is an arbitrary destination wallet chosen by the admin, not read or written here
    pub treasury: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetPaused<'info> {
    #[account(has_one = admin_authority)]
    pub config: Account<'info, Config>,
    pub admin_authority: Signer<'info>,
    #[account(mut, has_one = config)]
    pub pool: Account<'info, Pool>,
}

#[derive(Accounts)]
#[instruction(amount: u64, position_nonce: u64)]
pub struct Stake<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(constraint = !pool.paused @ TokenVaultError::PoolPaused)]
    pub pool: Account<'info, Pool>,
    #[account(
        init,
        payer = owner,
        space = 8 + 32 + 32 + 8 + 8 + 8 + 1,
        seeds = [
            b"stake_position",
            pool.key().as_ref(),
            owner.key().as_ref(),
            &position_nonce.to_le_bytes(),
        ],
        bump,
    )]
    pub stake_position: Account<'info, StakePosition>,
    #[account(
        mut,
        constraint = owner_token_account.owner == owner.key(),
        constraint = owner_token_account.mint == pool.stake_mint,
    )]
    pub owner_token_account: Account<'info, TokenAccount>,
    #[account(mut, address = pool.vault)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(has_one = config)]
    pub pool: Account<'info, Pool>,
    #[account(seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    #[account(mut, close = owner, has_one = owner, has_one = pool)]
    pub stake_position: Account<'info, StakePosition>,
    #[account(
        mut,
        constraint = owner_token_account.owner == owner.key(),
        constraint = owner_token_account.mint == pool.stake_mint,
    )]
    pub owner_token_account: Account<'info, TokenAccount>,
    #[account(mut, address = pool.vault)]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = owner_reward_token_account.owner == owner.key(),
        constraint = owner_reward_token_account.mint == reward_mint.key(),
    )]
    pub owner_reward_token_account: Account<'info, TokenAccount>,
    #[account(mut, address = config.reward_mint)]
    pub reward_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct WithdrawEarly<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub pool: Account<'info, Pool>,
    #[account(mut, close = owner, has_one = owner, has_one = pool)]
    pub stake_position: Account<'info, StakePosition>,
    #[account(mut)]
    pub owner_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub treasury_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[error_code]
pub enum TokenVaultError {
    #[msg("Pool is paused for new deposits")]
    PoolPaused,
    #[msg("Stake position has not reached its unlock time yet")]
    StillLocked,
    #[msg("Stake position is already unlocked, use withdraw instead of withdraw_early")]
    AlreadyUnlocked,
    #[msg("Stake amount must be greater than zero")]
    ZeroAmount,
    #[msg("Computed Reward overflows u64")]
    RewardOverflow,
}
