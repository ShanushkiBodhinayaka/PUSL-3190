import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

        if (!supabaseUrl || !serviceRoleKey || !anonKey) {
            return jsonResponse({ error: 'Missing required Supabase environment variables.' }, 500);
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return jsonResponse({ error: 'Missing authorization header.' }, 401);
        }

        const userClient = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: authHeader } },
        });
        const adminClient = createClient(supabaseUrl, serviceRoleKey);

        const {
            data: { user: requester },
            error: authError,
        } = await userClient.auth.getUser();

        if (authError || !requester) {
            return jsonResponse({ error: 'Unauthorized.' }, 401);
        }

        const { data: requesterProfile, error: requesterProfileError } = await adminClient
            .from('profiles')
            .select('role')
            .eq('id', requester.id)
            .single();

        if (requesterProfileError || requesterProfile?.role !== 'admin') {
            return jsonResponse({ error: 'Only admins can delete users.' }, 403);
        }

        const body = await request.json();
        const userId = String(body.userId || '').trim();

        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
            return jsonResponse({ error: 'A valid user ID is required.' }, 400);
        }

        if (userId === requester.id) {
            return jsonResponse({ error: 'You cannot delete your own admin account while signed in.' }, 400);
        }

        const { data: targetProfile, error: targetProfileError } = await adminClient
            .from('profiles')
            .select('role, full_name')
            .eq('id', userId)
            .single();

        if (targetProfileError || !targetProfile) {
            return jsonResponse({ error: 'User profile was not found.' }, 404);
        }

        if (targetProfile.role === 'admin') {
            const { count, error: adminCountError } = await adminClient
                .from('profiles')
                .select('id', { count: 'exact', head: true })
                .eq('role', 'admin');

            if (adminCountError) {
                return jsonResponse({ error: adminCountError.message }, 400);
            }

            if ((count || 0) <= 1) {
                return jsonResponse({ error: 'You cannot delete the last admin account.' }, 400);
            }
        }

        const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
        if (deleteError) {
            return jsonResponse({ error: deleteError.message }, 400);
        }

        return jsonResponse({
            ok: true,
            deletedUserId: userId,
            fullName: targetProfile.full_name || null,
        });
    } catch (error) {
        return jsonResponse({ error: error.message || 'Unexpected error.' }, 500);
    }
});
