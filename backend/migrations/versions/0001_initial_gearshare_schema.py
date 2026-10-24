"""Initial GearShare schema"""
from alembic import op
import sqlalchemy as sa

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('assets',
    sa.Column('storage_order', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('inventory_code', sa.String(), nullable=False),
    sa.Column('inventory_code_key', sa.String(), nullable=False),
    sa.Column('name', sa.String(), nullable=False),
    sa.Column('category', sa.String(), nullable=False),
    sa.Column('description', sa.String(), nullable=False),
    sa.Column('location', sa.String(), nullable=False),
    sa.Column('state', sa.String(), nullable=False),
    sa.Column('availability_version', sa.Integer(), server_default='1', nullable=False),
    sa.CheckConstraint("category IN ('Cameras', 'Audio', 'Presentation', 'Accessories')", name='asset_category'),
    sa.CheckConstraint("state IN ('active', 'maintenance')", name='asset_state'),
    sa.CheckConstraint('availability_version >= 1', name='asset_availability_version'),
    sa.PrimaryKeyConstraint('storage_order'),
    sa.UniqueConstraint('id'),
    sa.UniqueConstraint('inventory_code_key')
    )
    op.create_table('seed_marker',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('seeded_on', sa.Date(), nullable=False),
    sa.CheckConstraint('id = 1', name='singleton_seed_marker'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('users',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('username', sa.String(), nullable=False),
    sa.Column('password_hash', sa.String(), nullable=False),
    sa.Column('role', sa.String(), nullable=False),
    sa.CheckConstraint("role IN ('student', 'coordinator')", name='user_role'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('username')
    )
    op.create_table('bookings',
    sa.Column('storage_order', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('asset_id', sa.String(), nullable=False),
    sa.Column('asset_name', sa.String(), nullable=False),
    sa.Column('user_id', sa.String(), nullable=False),
    sa.Column('start_date', sa.Date(), nullable=False),
    sa.Column('end_date', sa.Date(), nullable=False),
    sa.Column('purpose', sa.String(), nullable=False),
    sa.Column('state', sa.String(), nullable=False),
    sa.Column('version', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint("state IN ('pending', 'approved', 'checked_out', 'rejected', 'cancelled', 'returned')", name='booking_state'),
    sa.CheckConstraint('end_date >= start_date', name='booking_dates'),
    sa.CheckConstraint('version >= 1', name='booking_version'),
    sa.ForeignKeyConstraint(['asset_id'], ['assets.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('storage_order'),
    sa.UniqueConstraint('asset_id', 'id', name='booking_asset_reference'),
    sa.UniqueConstraint('id')
    )
    op.create_index(op.f('ix_bookings_asset_id'), 'bookings', ['asset_id'], unique=False)
    op.create_index(op.f('ix_bookings_user_id'), 'bookings', ['user_id'], unique=False)
    op.create_table('sessions',
    sa.Column('token_hash', sa.String(), nullable=False),
    sa.Column('user_id', sa.String(), nullable=False),
    sa.Column('expires_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('token_hash')
    )
    op.create_index(op.f('ix_sessions_user_id'), 'sessions', ['user_id'], unique=False)
    op.create_table('active_loans',
    sa.Column('asset_id', sa.String(), nullable=False),
    sa.Column('booking_id', sa.String(), nullable=False),
    sa.ForeignKeyConstraint(['asset_id', 'booking_id'], ['bookings.asset_id', 'bookings.id'], ),
    sa.ForeignKeyConstraint(['asset_id'], ['assets.id'], ),
    sa.PrimaryKeyConstraint('asset_id'),
    sa.UniqueConstraint('booking_id')
    )
    op.create_table('booking_events',
    sa.Column('storage_order', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('booking_id', sa.String(), nullable=False),
    sa.Column('actor_id', sa.String(), nullable=False),
    sa.Column('action', sa.String(), nullable=False),
    sa.Column('prior_state', sa.String(), nullable=True),
    sa.Column('new_state', sa.String(), nullable=False),
    sa.Column('timestamp', sa.DateTime(), nullable=False),
    sa.Column('note', sa.String(), nullable=False),
    sa.CheckConstraint("action IN ('create', 'approve', 'reject', 'cancel', 'checkout', 'return')", name='event_action'),
    sa.CheckConstraint("new_state IN ('pending', 'approved', 'checked_out', 'rejected', 'cancelled', 'returned')", name='event_new_state'),
    sa.CheckConstraint("prior_state IS NULL OR prior_state IN ('pending', 'approved', 'checked_out', 'rejected', 'cancelled', 'returned')", name='event_prior_state'),
    sa.ForeignKeyConstraint(['actor_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['booking_id'], ['bookings.id'], ),
    sa.PrimaryKeyConstraint('storage_order'),
    sa.UniqueConstraint('id')
    )
    op.create_index(op.f('ix_booking_events_booking_id'), 'booking_events', ['booking_id'], unique=False)
    op.create_table('reservation_slots',
    sa.Column('asset_id', sa.String(), nullable=False),
    sa.Column('day', sa.Date(), nullable=False),
    sa.Column('booking_id', sa.String(), nullable=False),
    sa.ForeignKeyConstraint(['asset_id', 'booking_id'], ['bookings.asset_id', 'bookings.id'], ),
    sa.ForeignKeyConstraint(['asset_id'], ['assets.id'], ),
    sa.PrimaryKeyConstraint('asset_id', 'day')
    )
    op.create_index(op.f('ix_reservation_slots_booking_id'), 'reservation_slots', ['booking_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_reservation_slots_booking_id'), table_name='reservation_slots')
    op.drop_table('reservation_slots')
    op.drop_index(op.f('ix_booking_events_booking_id'), table_name='booking_events')
    op.drop_table('booking_events')
    op.drop_table('active_loans')
    op.drop_index(op.f('ix_sessions_user_id'), table_name='sessions')
    op.drop_table('sessions')
    op.drop_index(op.f('ix_bookings_user_id'), table_name='bookings')
    op.drop_index(op.f('ix_bookings_asset_id'), table_name='bookings')
    op.drop_table('bookings')
    op.drop_table('users')
    op.drop_table('seed_marker')
    op.drop_table('assets')
