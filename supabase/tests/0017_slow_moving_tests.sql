-- Security + business-rule tests for 0017. Run in Supabase Studio SQL editor
-- AFTER applying 0017. Everything runs in one transaction that is ROLLED BACK,
-- so no data is left behind. Any failed assertion raises an exception; success
-- ends with the NOTICE 'ALL 0017 TESTS PASSED'.
--
-- Run the whole file at once (do not remove the final ROLLBACK).

begin;

do $$
declare
  a_auth uuid; a_rep uuid; b_auth uuid; b_rep uuid;
  cust1 uuid; cust2 uuid; sess uuid; sess2 uuid; rid uuid;
  n int; items uuid[];
  caught boolean;
begin
  -- two distinct plain reps + two scratch customers (rolled back at the end)
  select auth_user_id, id into a_auth, a_rep from reps
   where active and not coalesce(is_super_admin,false) order by name limit 1;
  select auth_user_id, id into b_auth, b_rep from reps
   where active and not coalesce(is_super_admin,false) and id <> a_rep order by name limit 1;
  insert into customers (name, normalized_key, area) values ('ZZ TEST 1', 'ZZ TEST 1|', '') returning id into cust1;
  insert into customers (name, normalized_key, area) values ('ZZ TEST 2', 'ZZ TEST 2|', '') returning id into cust2;

  -- ===== act as rep A =====
  perform set_config('request.jwt.claims', json_build_object('sub', a_auth, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- T1/T2: start creates a session with one item per ACTIVE product, and is resumable (no duplicate)
  sess := start_product_assessment(cust1);
  select count(*) into n from product_assessment_items where session_id = sess;
  assert n = (select count(*) from slow_moving_products where active), 'T1 items != active products';
  assert n = 8, 'T1 expected 8 seeded products';
  assert start_product_assessment(cust1) = sess, 'T2 second start must resume the same draft';
  select count(*) into n from product_assessment_sessions where rep_id = a_rep and customer_id = cust1;
  assert n = 1, 'T2 duplicate session created';

  -- T3: ownership comes from auth.uid(), linked visit exists and is A's
  assert (select rep_id from product_assessment_sessions where id = sess) = a_rep, 'T3 rep_id not from auth';
  assert (select v.rep_id from customer_visits v join product_assessment_sessions s on s.visit_id = v.id where s.id = sess) = a_rep, 'T3 visit not A';

  -- T4: completion blocked with all statuses missing
  caught := false;
  begin perform complete_product_assessment(sess); exception when check_violation then caught := true; end;
  assert caught, 'T4 completion allowed with no statuses';

  -- T5: 7 of 8 answered (incl. not_applicable) still blocked
  select array_agg(id) into items from product_assessment_items where session_id = sess;
  update product_assessment_items set feedback_status = 'not_applicable', not_applicable_reason = 'no restaurant use' where id = items[1];
  for i in 2..7 loop
    update product_assessment_items set feedback_status = 'interested' where id = items[i];
  end loop;
  caught := false;
  begin perform complete_product_assessment(sess); exception when check_violation then caught := true; end;
  assert caught, 'T5 completion allowed with 1 missing status';

  -- T6: invalid status value rejected by check constraint
  caught := false;
  begin update product_assessment_items set feedback_status = 'bogus' where id = items[8]; exception when check_violation then caught := true; end;
  assert caught, 'T6 invalid status accepted';

  -- T7: 8/8 (Not applicable valid) completes; second call is a harmless no-op
  update product_assessment_items set feedback_status = 'not_interested', rejection_reason = 'quality' where id = items[8];
  perform complete_product_assessment(sess);
  perform complete_product_assessment(sess);
  assert (select assessment_status from product_assessment_sessions where id = sess) = 'completed', 'T7 not completed';

  -- T8: completed session is immutable for its own rep
  update product_assessment_items set feedback_status = 'interested' where id = items[1];
  get diagnostics n = row_count;
  assert n = 0, 'T8 completed item was editable by rep';

  -- T9: after completion a NEW assessment for the same customer is allowed (history preserved)
  sess2 := start_product_assessment(cust1);
  assert sess2 <> sess, 'T9 expected a fresh draft after completion';

  -- T10: reps cannot insert sessions/items/products directly, nor delete
  caught := false;
  begin insert into product_assessment_sessions (visit_id, customer_id, rep_id)
        values ((select id from customer_visits limit 1), cust1, a_rep);
  exception when others then caught := true; end;
  assert caught, 'T10a rep could insert session directly';
  caught := false;
  begin insert into slow_moving_products (product_name, packaging) values ('ZZ', 'x'); exception when others then caught := true; end;
  assert caught, 'T10b rep could add a product';
  update slow_moving_products set active = false;
  get diagnostics n = row_count;
  assert n = 0, 'T10c rep could deactivate products';
  delete from product_assessment_sessions where id = sess;
  get diagnostics n = row_count;
  assert n = 0, 'T10d rep could delete a session';

  -- T11: UNIQUE(session_id, product_id)
  execute 'reset role';
  caught := false;
  begin insert into product_assessment_items (session_id, product_id)
        select session_id, product_id from product_assessment_items where session_id = sess limit 1;
  exception when unique_violation then caught := true; end;
  assert caught, 'T11 duplicate (session, product) item accepted';

  -- ===== act as rep B: cannot touch A's open draft =====
  perform set_config('request.jwt.claims', json_build_object('sub', b_auth, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update product_assessment_items set feedback_status = 'interested' where session_id = sess2;
  get diagnostics n = row_count;
  assert n = 0, 'T12 rep B edited rep A draft';
  caught := false;
  begin perform complete_product_assessment(sess2); exception when others then caught := true; end;
  assert caught, 'T13 rep B completed rep A assessment';
  -- B can read (team-wide read convention) and has its own independent draft for the same customer
  assert (select count(*) from product_assessment_sessions where id = sess2) = 1, 'T14 team-wide read broken';
  rid := start_product_assessment(cust1);
  assert rid <> sess2, 'T15 B should get its own draft';

  -- ===== anon: sees nothing, cannot call RPCs =====
  execute 'reset role';
  execute 'set local role anon';
  select count(*) into n from product_assessment_sessions;
  assert n = 0, 'T16 anon can read sessions';
  caught := false;
  begin perform start_product_assessment(cust1); exception when others then caught := true; end;
  assert caught, 'T17 anon could call start_product_assessment';

  execute 'reset role';
  raise notice 'ALL 0017 TESTS PASSED';
end $$;

rollback;
