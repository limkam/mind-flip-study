import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import client from "@/api/client";
import { motion } from "framer-motion";
import { Users, Search, Shield, User, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

const roleIcons = {
  admin: Shield,
  student: User,
};

const roleColors = {
  admin: "bg-red-500/10 text-red-500 border-red-500/20",
  student: "bg-primary/10 text-primary border-primary/20",
};

export default function UserManagement() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("student");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviting, setInviting] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const { data } = await client.get("/users/");
      return data;
    },
  });

  const filtered = users.filter(u => {
    const matchSearch = !search || u.full_name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const handleInvite = async () => {
    if (!inviteEmail || !invitePassword || !inviteName) return;
    setInviting(true);
    try {
      await client.post("/users/", {
        email: inviteEmail,
        password: invitePassword,
        full_name: inviteName,
        role: inviteRole,
      });
      toast({ title: `User ${inviteEmail} created` });
      setInviteOpen(false);
      setInviteEmail("");
      setInviteName("");
      setInvitePassword("");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    } catch (e) {
      toast({
        title: "Could not create user",
        description: e.response?.data?.detail || e.message,
        variant: "destructive",
      });
    } finally {
      setInviting(false);
    }
  };

  const updateRole = async (userId, newRole) => {
    await client.patch(`/users/${userId}`, { role: newRole });
    queryClient.invalidateQueries({ queryKey: ["users"] });
    toast({ title: "Role updated" });
  };

  const getInitials = (name) => {
    if (!name) return "?";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="font-heading text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground mt-1">{users.length} users on the platform</p>
        </div>
        <Button onClick={() => setInviteOpen(true)} className="gap-2">
          <UserPlus className="w-4 h-4" /> Create user
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="student">Student</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        {isLoading && <p className="text-muted-foreground">Loading…</p>}
        {filtered.map((u, i) => {
          const RoleIcon = roleIcons[u.role] || User;
          return (
            <motion.div
              key={u.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.02 }}
              className="bg-card rounded-xl border border-border p-4 flex items-center gap-4"
            >
              <Avatar className="w-10 h-10">
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                  {getInitials(u.full_name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{u.full_name || "Unnamed"}</p>
                <p className="text-xs text-muted-foreground truncate">{u.email}</p>
              </div>
              <Badge variant="outline" className={`${roleColors[u.role] || roleColors.student} border gap-1`}>
                <RoleIcon className="w-3 h-3" />
                {(u.role || "student").charAt(0).toUpperCase() + (u.role || "student").slice(1)}
              </Badge>
              <Select value={u.role || "student"} onValueChange={v => updateRole(u.id, v)}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="student">Student</SelectItem>
                </SelectContent>
              </Select>
            </motion.div>
          );
        })}
      </div>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-heading">Create user</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2 overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label>Full name</Label>
              <Input placeholder="Jane Student" value={inviteName} onChange={e => setInviteName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input placeholder="user@email.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Temporary password</Label>
              <PasswordInput value={invitePassword} onChange={e => setInvitePassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="student">Student</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleInvite} disabled={inviting} className="w-full">
              {inviting ? "Creating..." : "Create user"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
