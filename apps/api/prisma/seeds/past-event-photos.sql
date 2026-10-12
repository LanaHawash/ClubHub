BEGIN;

UPDATE "Event"
SET "imageUrl" = 'https://www-cdn.najah.edu/media/filer_public_thumbnails/filer_public/d4/9f/d49f9ba0-3af3-42e3-b084-49438558baee/md_shwwn_ltlb_wjmy_mhndswn_bl_hdwd_tftthn_wrsh_tdrryby_bnwn_rhltk_lmhny_mn_syr_dhty_fl_l_swq_lml.jpg__1320x740_q95_crop_subsampling-2_upscale.jpg', "updatedAt" = NOW()
WHERE "title" = 'Your Professional Journey: From an Effective Resume to the Job Market';

UPDATE "Event"
SET "imageUrl" = 'https://lrc.najah.edu/media/filer_public_thumbnails/filer_public/5e/df/5edf9261-b357-403f-a3ec-2a637c4ec9e6/img_0309.jpg__720x540_q85_crop_subsampling-2_upscale.jpg', "updatedAt" = NOW()
WHERE "title" = 'Sign Language Awareness Event';

UPDATE "Event"
SET "imageUrl" = 'https://fmhs.najah.edu/media/filer_public_thumbnails/filer_public/52/e4/52e4f58c-67e0-47b9-bea3-f60c098e49d8/465043675_935030291981586_4326749461636677395_n.jpg__1170x0_q85_subsampling-2_upscale.jpg', "updatedAt" = NOW()
WHERE "title" = 'Medical Laboratory Awareness Initiative';

UPDATE "Event"
SET "imageUrl" = 'https://www-cdn.najah.edu/media/filer_public_thumbnails/filer_public/fa/6c/fa6c08ad-630c-4e6d-877f-b534a6793fc1/kly_ltb_wmd_shwwn_ltlb_tkhttmn_hml_thd_tlb__ltwwy_hwl_hqwq_ltfl_wmrd_lfshl_lklwy.jpg__1320x740_q95_crop_subsampling-2_upscale.jpg', "updatedAt" = NOW()
WHERE "title" = 'R.I.S.E. 2 H.E.A.L. Awareness Campaign';

COMMIT;
