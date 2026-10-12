-- expand-only: one login can use the restricted application role without another password.
do $$ begin
  -- Resolve the login to an identifier before Supabase's role-management hook.
  execute format('grant dartspoint_app to %I', current_user);
end $$;
