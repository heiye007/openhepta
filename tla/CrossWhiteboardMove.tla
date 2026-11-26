------------------------ MODULE CrossWhiteboardMove ------------------------
EXTENDS Naturals, FiniteSets

CONSTANTS
  WBS,
  OBJS

VARIABLES
  host,
  conns,
  inSection

vars == <<host, conns, inSection>>

TypeOK ==
  /\ host \in [OBJS -> WBS]
  /\ conns \subseteq (OBJS \times OBJS)
  /\ inSection \in [OBJS -> OBJS \cup {"NONE"}]

Init ==
  /\ host = [o \in OBJS |-> CHOOSE w \in WBS : TRUE]
  /\ conns = {}
  /\ inSection = [o \in OBJS |-> "NONE"]

AddConnection(u, v) ==
  /\ u \in OBJS
  /\ v \in OBJS
  /\ u # v
  /\ host[u] = host[v]
  /\ <<u, v>> \notin conns
  /\ conns' = conns \cup {<<u, v>>}
  /\ UNCHANGED <<host, inSection>>

RemoveConnection(u, v) ==
  /\ <<u, v>> \in conns
  /\ conns' = conns \ {<<u, v>>}
  /\ UNCHANGED <<host, inSection>>

AttachToSection(child, sec) ==
  /\ child \in OBJS
  /\ sec \in OBJS
  /\ child # sec
  /\ host[child] = host[sec]
  /\ inSection[sec] = "NONE"
  /\ inSection[child] = "NONE"
  /\ \A x \in OBJS : inSection[x] # child
  /\ inSection' = [inSection EXCEPT ![child] = sec]
  /\ UNCHANGED <<host, conns>>

MoveAcross(selected, targetWb) ==
  /\ selected \subseteq OBJS
  /\ selected # {}
  /\ targetWb \in WBS
  /\ LET expanded == selected \cup { o \in OBJS : inSection[o] \in selected }
     IN
       /\ \E o \in expanded : host[o] # targetWb
       /\ host' = [o \in OBJS |-> IF o \in expanded THEN targetWb ELSE host[o]]
       /\ conns' =
            { e \in conns :
                LET u == e[1]
                    v == e[2]
                IN (u \in expanded /\ v \in expanded) \/ (u \notin expanded /\ v \notin expanded) }
       /\ inSection' =
            [o \in OBJS |->
              IF o \in expanded /\ inSection[o] # "NONE" /\ inSection[o] \notin expanded
              THEN "NONE"
              ELSE inSection[o]]

Next ==
  \/ \E u \in OBJS, v \in OBJS : AddConnection(u, v)
  \/ \E u \in OBJS, v \in OBJS : RemoveConnection(u, v)
  \/ \E c \in OBJS, s \in OBJS : AttachToSection(c, s)
  \/ \E sel \in (SUBSET OBJS \ {{}}), w \in WBS : MoveAcross(sel, w)

Spec == Init /\ [][Next]_vars

NoCrossWhiteboardConnections ==
  \A e \in conns : host[e[1]] = host[e[2]]

NoSelfLoops ==
  \A e \in conns : e[1] # e[2]

SectionCoLocation ==
  \A o \in OBJS : inSection[o] # "NONE" => host[o] = host[inSection[o]]

=============================================================================
