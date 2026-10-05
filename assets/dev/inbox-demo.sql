-- Fictional local-only inbox fixtures. Re-running preserves existing demo edits.
-- Run with psql against harly_talmore_eval; this never enqueues or sends email.
BEGIN;
DO $$
DECLARE
  workspace text := 'fdc1cc2a-721c-4673-b101-d01078f63c37';
  job uuid := 'fc3fcf99-290d-409a-bd20-8e75ccb366f7';
  stage uuid;
  recruiter text;
  person record;
  conversation record;
  message record;
  cid uuid;
  aid uuid;
  tid uuid;
BEGIN
  IF current_database() <> 'harly_talmore_eval' THEN
    RAISE EXCEPTION 'These fixtures may only run in harly_talmore_eval';
  END IF;
  SELECT id INTO STRICT stage FROM job_stages WHERE job_id = job AND name = 'Applied';
  SELECT user_id INTO STRICT recruiter FROM member WHERE organization_id = workspace LIMIT 1;

  FOR person IN SELECT * FROM (VALUES
    ('jordan','Jordan','Santos'),
    ('alex','Alex','Reyes'),
    ('maya','Maya','Cruz'),
    ('sam','Sam','Rivera')
  ) AS people(key,first_name,last_name) LOOP
    cid := md5('talmore-inbox-demo-candidate-' || person.key)::uuid;
    aid := md5('talmore-inbox-demo-application-' || person.key)::uuid;
    INSERT INTO candidates (id,workspace_id,first_name,last_name,email)
      VALUES (cid,workspace,person.first_name,person.last_name,person.key || '.inbox-demo@example.test')
      ON CONFLICT (id) DO NOTHING;
    INSERT INTO applications (id,workspace_id,candidate_id,job_id,current_stage_id,source,applied_at)
      VALUES (aid,workspace,cid,job,stage,'local_demo',now()-interval '3 days')
      ON CONFLICT (id) DO NOTHING;
  END LOOP;

  FOR conversation IN SELECT * FROM (VALUES
    ('jordan-receipt','jordan','Application received: Robot Operator','open',false),
    ('jordan-interview','jordan','Interview availability: Robot Operator','open',true),
    ('jordan-documents','jordan','Documents for your application','open',false),
    ('alex-receipt','alex','Application received: Robot Operator','open',false),
    ('maya-shifts','maya','Question about rotating shifts','open',true),
    ('sam-confirmed','sam','Interview confirmed for Thursday','archived',true),
    ('unlinked-inquiry','taylor','Question about the Robot Operator vacancy','open',false)
  ) AS conversations(key,person_key,subject,status,assigned) LOOP
    tid := md5('talmore-inbox-demo-thread-' || conversation.key)::uuid;
    cid := CASE WHEN conversation.person_key = 'taylor' THEN NULL ELSE md5('talmore-inbox-demo-candidate-' || conversation.person_key)::uuid END;
    aid := CASE WHEN cid IS NULL THEN NULL ELSE md5('talmore-inbox-demo-application-' || conversation.person_key)::uuid END;
    INSERT INTO mail_threads (id,workspace_id,source,subject,normalized_subject,participant_email,candidate_id,application_id,owner_id,status)
      VALUES (tid,workspace,'provider',conversation.subject,lower(conversation.subject),conversation.person_key || '.inbox-demo@example.test',cid,aid,CASE WHEN conversation.assigned THEN recruiter ELSE NULL END,conversation.status)
      ON CONFLICT (id) DO NOTHING;

    FOR message IN SELECT * FROM (VALUES
      ('jordan-receipt',1,'outbound',4300,true,E'Hi Jordan,\n\nThank you for applying for the Robot Operator position. We have received your application. If we would like to arrange a conversation, our recruiting team will contact you with the next steps.\n\nThank you,\nThe fictional recruiting team'),
      ('jordan-interview',1,'outbound',3000,true,E'Hi Jordan,\n\nWe would like to arrange a short interview. Would Thursday afternoon work for you?\n\nBest,\nAlex from the recruiting team'),
      ('jordan-interview',2,'inbound',2800,true,E'Hello Alex,\n\nThursday works for me. I am available after 1pm.\n\nThanks,\nJordan'),
      ('jordan-interview',3,'outbound',1500,true,E'Hi Jordan,\n\nWould 2pm work? The interview will take about 30 minutes. Please have a short example ready of a time you had to troubleshoot a technical problem.\n\nBest,\nAlex'),
      ('jordan-interview',4,'inbound',35,false,E'Hi Alex,\n\nYes, 2pm works well. Could you confirm whether this is onsite or a video call?\n\nThanks,\nJordan\n\nOn Wednesday, Alex wrote:\n> Would 2pm work? The interview will take about 30 minutes.'),
      ('jordan-interview',5,'inbound',12,false,E'One more question: should I bring a printed copy of my resume?\n\nJordan'),
      ('jordan-documents',1,'outbound',800,true,E'Hi Jordan,\n\nPlease check that your education and contact details are up to date in your application. You can bring supporting documents to the interview.\n\nThank you,\nThe recruiting team'),
      ('alex-receipt',1,'outbound',95,true,E'Hi Alex,\n\nThank you for applying for the Robot Operator position. We have received your application. Our team will contact you if we would like to arrange an interview.\n\nThank you,\nThe fictional recruiting team'),
      ('maya-shifts',1,'inbound',240,true,E'Hello,\n\nI am interested in the Robot Operator position. Does the role include night shifts? I would also like to know whether training is onsite.\n\nRegards,\nMaya'),
      ('maya-shifts',2,'outbound',180,true,E'Hi Maya,\n\nThe role is onsite in Alabang and includes rotating shifts, including nights. Training is provided. We can discuss the schedule in more detail during the interview.\n\nBest,\nThe recruiting team'),
      ('maya-shifts',3,'inbound',8,false,E'Thank you for explaining. I am comfortable with rotating shifts and can travel to Alabang. What would be the next step?\n\nRegards,\nMaya\n\nOn Wednesday, Recruiting wrote:\n> The role is onsite in Alabang and includes rotating shifts.'),
      ('sam-confirmed',1,'outbound',4400,true,E'Hi Sam,\n\nYour interview is confirmed for Thursday at 10am. Please reply to confirm that you can attend.\n\nThank you,\nThe recruiting team'),
      ('sam-confirmed',2,'inbound',4300,true,E'Thank you, I confirm that I can attend.\n\nSam'),
      ('sam-confirmed',3,'outbound',4200,true,E'Thanks, Sam. We look forward to speaking with you.\n\nBest,\nThe recruiting team'),
      ('unlinked-inquiry',1,'inbound',22,false,E'Hello recruiting team,\n\nI found the Robot Operator vacancy and have a question before applying. Are fresh graduates welcome?\n\nThank you,\nTaylor')
    ) AS messages(thread_key,sequence,direction,minutes_ago,is_read,body)
    WHERE thread_key = conversation.key LOOP
      INSERT INTO mail_messages (id,workspace_id,thread_id,candidate_id,application_id,message_id,in_reply_to,direction,from_email,to_emails,subject,text_body,received_at,read_at)
      VALUES (
        md5('talmore-inbox-demo-message-' || message.thread_key || '-' || message.sequence)::uuid,
        workspace,tid,cid,aid,
        '<inbox-demo-' || message.thread_key || '-' || message.sequence || '@example.test>',
        CASE WHEN message.sequence > 1 THEN '<inbox-demo-' || message.thread_key || '-' || (message.sequence-1) || '@example.test>' ELSE NULL END,
        message.direction::message_direction,
        CASE WHEN message.direction = 'inbound' THEN conversation.person_key || '.inbox-demo@example.test' ELSE 'recruiting@example.test' END,
        jsonb_build_array(CASE WHEN message.direction = 'inbound' THEN 'recruiting@example.test' ELSE conversation.person_key || '.inbox-demo@example.test' END),
        conversation.subject,message.body,now()-make_interval(mins => message.minutes_ago),
        CASE WHEN message.is_read THEN now()-make_interval(mins => message.minutes_ago) ELSE NULL END
      ) ON CONFLICT (id) DO NOTHING;
    END LOOP;
    UPDATE mail_threads SET
      unread_count = (SELECT count(*) FROM mail_messages WHERE thread_id = tid AND read_at IS NULL),
      last_message_at = (SELECT max(received_at) FROM mail_messages WHERE thread_id = tid)
    WHERE id = tid AND workspace_id = workspace;
  END LOOP;
END $$;
COMMIT;
