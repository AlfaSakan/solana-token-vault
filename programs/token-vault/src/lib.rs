use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

declare_id!("TokenVau1t11111111111111111111111111111111");

#[program]
pub mod token_vault {
    use super::*;

    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }

    pub fn create_pool(
        _ctx: Context<CreatePool>,
        _lock_duration_seconds: i64,
        _reward_rate_bps: u64,
        _early_withdrawal_penalty_bps: u16,
    ) -> Result<()> {
        Ok(())
    }

    pub fn set_paused(_ctx: Context<SetPaused>, _paused: bool) -> Result<()> {
        Ok(())
    }

    pub fn stake(_ctx: Context<Stake>, _amount: u64) -> Result<()> {
        Ok(())
    }

    pub fn withdraw(_ctx: Context<Withdraw>) -> Result<()> {
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
    pub authority_config: Pubkey,
    pub stake_mint: Pubkey,
    pub vault: Pubkey,
    pub treasury: Pubkey,
    pub lock_duration_seconds: i64,
    pub reward_rate_bps: u64,
    pub early_withdrawal_penalty_bps: u16,
    pub paused: bool,
    pub bump: u8,
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
    #[account(init, payer = admin_authority, space = 8 + 32 + 32 + 1)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub reward_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreatePool<'info> {
    #[account(mut, has_one = admin_authority)]
    pub config: Account<'info, Config>,
    pub admin_authority: Signer<'info>,
    #[account(init, payer = admin_authority, space = 8 + 32 + 32 + 32 + 32 + 8 + 8 + 2 + 1 + 1)]
    pub pool: Account<'info, Pool>,
    pub stake_mint: Account<'info, Mint>,
    #[account(mut)]
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
    #[account(mut)]
    pub pool: Account<'info, Pool>,
}

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    #[account(init, payer = owner, space = 8 + 32 + 32 + 8 + 8 + 8 + 1)]
    pub stake_position: Account<'info, StakePosition>,
    #[account(mut)]
    pub owner_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub pool: Account<'info, Pool>,
    pub config: Account<'info, Config>,
    #[account(mut, close = owner, has_one = owner, has_one = pool)]
    pub stake_position: Account<'info, StakePosition>,
    #[account(mut)]
    pub owner_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub owner_reward_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
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
}
